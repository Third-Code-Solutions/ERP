'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, desc, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireUserProfile,
  can,
  createSupabaseAdminClient,
  type ErpCapability,
  type AppRole,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  pprfSubmissions,
  siteInspections,
  designFiles,
  designFileVersions,
  opportunities,
  documents,
  accounts,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import {
  changeRequestWritesUseCoreApi,
  createChangeRequestThroughCoreApi,
} from '@/lib/erp-core-client'
import { startSlaClock } from '@/lib/operations/sla-clock'
import { notifyRoles } from '@/lib/operations/notifications'
import { inngest } from '@/lib/inngest'
import {
  buildInspectionReportHtml,
  type InspectionPhotoInput,
  type InspectionRfiInput,
} from '@/lib/pdf/site-inspection-report'

// REFACTOR.md M2 US-006..US-009 — Proposal Workflow server actions.
//
// Pattern mirror: /crm/accounts/actions.ts — capability guard, Zod parse,
// audit log, revalidatePath. All writes are tenant-scoped via the user
// profile's tenantId.

function guard(role: AppRole, capability: ErpCapability) {
  if (!can(role, capability)) {
    return `Forbidden: role "${role}" lacks "${capability}"` as const
  }
  return null
}

function logProposalActionFailure(input: {
  action: string
  tenantId: string
  actorId: string
  error: unknown
  opportunityId?: string
  changeRequestId?: string
}): void {
  console.error(
    JSON.stringify({
      event: 'proposal_action_failed',
      trace_id: randomUUID(),
      tenant_id: input.tenantId,
      actor_id: input.actorId,
      action: input.action,
      outcome: 'error',
      opportunity_id: input.opportunityId,
      change_request_id: input.changeRequestId,
      error: input.error instanceof Error ? input.error.message : 'unknown',
    }),
  )
}

const DESIGN_FILE_TYPE_VALUES = [
  'initial_layout',
  'final_rendering',
  'animation',
  'revised',
] as const
const PRIORITY_VALUES = ['minor', 'major'] as const

// Schemas live in ./schemas.ts so this 'use server' file only exports
// async functions per Next.js constraint.
import type { PprfPayload } from './schemas'
import {
  pprfResubmissionCommandSchema,
  pprfSubmissionResultSchema,
  pprfSubmissionService,
} from '@/server/crm/pprf-submission-service'
import {
  siteInspectionRfiCommandSchema,
  siteInspectionSubmissionCommandSchema,
  siteInspectionWorkflowResultSchema,
  siteInspectionWorkflowService,
} from '@/server/crm/site-inspection-workflow-service'
import {
  createChangeRequestRecord,
  resolveChangeRequestRecord,
  type ChangeRequestPriority,
} from './change-request-workflow'
// Re-export the type for downstream imports that still reference it here.
export type { PprfPayload }

async function assertOpportunity(tenantId: string, opportunityId: string) {
  const [opp] = await db
    .select({ id: opportunities.id, project_id: opportunities.project_id })
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, tenantId)))
    .limit(1)
  return opp ?? null
}

const PPRF_FIELD_NAMES = [
  'submission_id',
  'site_address',
  'floor_area_sqm',
  'landlord_contact',
  'as_built_available',
  'scope_notes',
  'project_type',
  'expected_start_date',
  'budget_range',
] as const
const PPRF_FIELD_NAME_SET = new Set<string>(PPRF_FIELD_NAMES)

function logPprfOutcome(input: {
  traceId: string
  tenantId: string | null
  actorId: string | null
  outcome: string
  errorCode?: string
}): void {
  console.info(JSON.stringify({
    event: 'pprf_action',
    trace_id: input.traceId,
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    action: 'pprf.resubmission.submit',
    outcome: input.outcome,
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
  }))
}

function readPprfFields(formData: FormData):
  | { ok: true; values: Record<(typeof PPRF_FIELD_NAMES)[number], string> }
  | { ok: false; error: string } {
  for (const [name] of formData.entries()) {
    if (!PPRF_FIELD_NAME_SET.has(name)) {
      return { ok: false, error: `form: unexpected field "${name}"` }
    }
  }
  const values = {} as Record<(typeof PPRF_FIELD_NAMES)[number], string>
  for (const name of PPRF_FIELD_NAMES) {
    const entries = formData.getAll(name)
    if (entries.length !== 1 || typeof entries[0] !== 'string') {
      return { ok: false, error: `${name}: exactly one text value is required` }
    }
    values[name] = entries[0]
  }
  return { ok: true, values }
}

// US-006 — Submit a new versioned PPRF for a server-bound opportunity.
export async function submitPprf(opportunityId: string, formData: FormData) {
  const traceId = randomUUID()
  let tenantId: string | null = null
  let actorId: string | null = null
  try {
    const profile = await requireUserProfile()
    tenantId = profile.tenantId
    actorId = profile.user.id
    if (!can(profile.role, 'pprf.submit')) {
      logPprfOutcome({ traceId, tenantId, actorId, outcome: 'forbidden' })
      return { ok: false as const, error: 'You do not have permission to submit a PPRF.' }
    }

    const fields = readPprfFields(formData)
    if (!fields.ok) {
      logPprfOutcome({ traceId, tenantId, actorId, outcome: 'validation_error' })
      return { ok: false as const, error: fields.error }
    }
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(fields.values.floor_area_sqm)) {
      logPprfOutcome({ traceId, tenantId, actorId, outcome: 'validation_error' })
      return { ok: false as const, error: 'floor_area_sqm: invalid number' }
    }
    const floorAreaSqm = Number(fields.values.floor_area_sqm)
    const parsed = pprfResubmissionCommandSchema.safeParse({
      submissionId: fields.values.submission_id,
      opportunityId,
      pprf: {
        siteAddress: fields.values.site_address,
        floorAreaSqm,
        landlordContact: fields.values.landlord_contact,
        asBuiltAvailable: fields.values.as_built_available,
        scopeNotes: fields.values.scope_notes,
        projectType: fields.values.project_type,
        expectedStartDate: fields.values.expected_start_date || undefined,
        budgetRange: fields.values.budget_range,
      },
    })
    if (!parsed.success) {
      const first = parsed.error.errors[0]
      logPprfOutcome({ traceId, tenantId, actorId, outcome: 'validation_error' })
      return { ok: false as const, error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
    }

    const rawResult = await pprfSubmissionService.submitResubmission(
      { tenantId, userId: actorId }, parsed.data
    )
    const checked = pprfSubmissionResultSchema.safeParse(rawResult)
    if (!checked.success) {
      logPprfOutcome({ traceId, tenantId, actorId, outcome: 'service_contract_failure' })
      return { ok: false as const, error: 'The PPRF service returned an invalid response. Please retry.' }
    }
    if (!checked.data.ok) {
      logPprfOutcome({
        traceId, tenantId, actorId,
        outcome: checked.data.error.code === 'CONFLICT' ? 'conflict' : 'service_rejected',
        errorCode: checked.data.error.code,
      })
      return { ok: false as const, error: checked.data.error.message }
    }
    if (
      checked.data.kind !== 'resubmission' ||
      checked.data.tenantId !== tenantId ||
      checked.data.opportunityId !== opportunityId
    ) {
      logPprfOutcome({ traceId, tenantId, actorId, outcome: 'service_contract_failure' })
      return { ok: false as const, error: 'The PPRF service response did not match this submission. Please retry.' }
    }

    let refreshFailed = false
    try {
      revalidatePath(`/crm/opportunities/${opportunityId}/proposal/pprf`)
      revalidatePath(`/crm/opportunities/${opportunityId}/proposal`)
      revalidatePath(`/crm/opportunities/${opportunityId}`)
    } catch {
      refreshFailed = true
    }
    logPprfOutcome({
      traceId, tenantId, actorId,
      outcome: refreshFailed ? 'success_refresh_failed' : 'success',
    })
    return {
      ok: true as const,
      kind: checked.data.kind,
      opportunityId: checked.data.opportunityId,
      pprfSubmissionId: checked.data.pprfSubmissionId,
      version: checked.data.version,
      replayed: checked.data.replayed,
      refreshFailed,
    }
  } catch {
    logPprfOutcome({ traceId, tenantId, actorId, outcome: 'unexpected_error' })
    return { ok: false as const, error: 'Unable to submit the PPRF. Please retry.' }
  }
}

// US-007 — Submit a site inspection. Requires a PPRF to already exist.
const INSPECTION_FIELD_NAMES = [
  'client_submission_id',
  'site_address',
  'floor_area_sqm',
  'landlord_contact',
  'as_built_available',
  'expected_start_date',
  'weather',
  'accessibility_notes',
  'observations',
  'photo_document_ids',
] as const
const INSPECTION_FIELD_NAME_SET = new Set<string>(INSPECTION_FIELD_NAMES)

const RFI_FIELD_NAMES = ['submission_id', 'description', 'priority'] as const
const RFI_FIELD_NAME_SET = new Set<string>(RFI_FIELD_NAMES)

function readExactTextFields<const T extends readonly string[]>(
  formData: FormData,
  names: T,
  allowedNames: ReadonlySet<string>,
): { ok: true; values: Record<T[number], string> } | { ok: false; error: string } {
  for (const [name] of formData.entries()) {
    if (!allowedNames.has(name)) {
      return { ok: false, error: `form: unexpected field "${name}"` }
    }
  }
  const values = {} as Record<T[number], string>
  for (const name of names) {
    const entries = formData.getAll(name)
    if (entries.length !== 1 || typeof entries[0] !== 'string') {
      return { ok: false, error: `${name}: exactly one text value is required` }
    }
    values[name as T[number]] = entries[0]
  }
  return { ok: true, values }
}

function logSiteInspectionOutcome(input: {
  traceId: string
  tenantId: string | null
  actorId: string | null
  action: 'site_inspection.submit' | 'site_inspection_rfi.create'
  outcome: string
  errorCode?: string
}): void {
  console.info(JSON.stringify({
    event: 'site_inspection_action',
    trace_id: input.traceId,
    tenant_id: input.tenantId,
    actor_id: input.actorId,
    action: input.action,
    outcome: input.outcome,
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
  }))
}

// US-007 #5 — Render the inspection report to HTML, upload to Storage, and
// insert a tenant-scoped documents row + link pdf_document_id on the
// inspection. Pre-Won opportunities have no project yet, so opportunity_id
// is the durable parent for the report until a project is created.
//
// Why this lives next to the action: it's tightly coupled to the
// submitInspection flow and only ever called from there. Extracting to a
// dedicated module would just add an import without changing reuse.
async function persistInspectionReport(args: {
  tenantId: string
  actorId: string
  inspectionId: string
  opportunityId: string
  payload: Record<string, unknown>
  photoDocumentIds: string[]
}): Promise<void> {
  // Resolve the joined context the builder needs. Same shape as the
  // /print/inspection page so the archived HTML matches the live view.
  const [oppRow] = await db
    .select({ project_id: opportunities.project_id, account_id: opportunities.account_id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, args.opportunityId),
        eq(opportunities.tenant_id, args.tenantId),
      ),
    )
    .limit(1)
  if (!oppRow) throw new Error('Opportunity not found while archiving inspection report')

  const [projectRow] = oppRow.project_id
    ? await db
        .select({
          id: projects.id,
          name: projects.name,
          client: projects.client,
          location: projects.location,
        })
        .from(projects)
        .where(and(eq(projects.id, oppRow.project_id), eq(projects.tenant_id, args.tenantId)))
        .limit(1)
    : [null]

  const [accountRow] = oppRow.account_id
    ? await db
        .select({
          id: accounts.id,
          name: accounts.name,
          billing_address: accounts.billing_address,
        })
        .from(accounts)
        .where(and(eq(accounts.id, oppRow.account_id), eq(accounts.tenant_id, args.tenantId)))
        .limit(1)
    : [null]

  const [tenantRow] = await db
    .select({
      name: tenants.name,
      bir_tin: tenants.bir_tin,
      pcab_license: tenants.pcab_license,
    })
    .from(tenants)
    .where(eq(tenants.id, args.tenantId))
    .limit(1)

  const [inspectorRow] = await db
    .select({ full_name: users.full_name, email: users.email })
    .from(users)
    .where(and(eq(users.id, args.actorId), eq(users.tenant_id, args.tenantId)))
    .limit(1)

  // Photos archive — we only need (document_id, caption) for the builder.
  // Captions don't exist on first submission yet; pull whatever's there.
  const photoRows: InspectionPhotoInput[] = args.photoDocumentIds.map((doc, i) => ({
    id: `${args.inspectionId}-photo-${i}`,
    document_id: doc,
    caption: null,
  }))

  // RFIs are added post-submission via addInspectionRfi, so at this point
  // there are none. The builder handles the empty case cleanly.
  const rfiRows: InspectionRfiInput[] = []

  const now = new Date()
  const html = buildInspectionReportHtml({
    inspection: {
      id: args.inspectionId,
      opportunity_id: args.opportunityId,
      payload: args.payload,
      submitted_at: now,
      created_at: now,
    },
    photos: photoRows,
    rfis: rfiRows,
    project: projectRow ?? null,
    account: accountRow ?? null,
    brand: {
      tenant_name: tenantRow?.name ?? null,
      bir_tin: tenantRow?.bir_tin ?? null,
      pcab_license: tenantRow?.pcab_license ?? null,
      inspector_name: inspectorRow?.full_name ?? inspectorRow?.email ?? null,
    },
  })

  // Storage path. Use project_id when we have it (groups archived reports
  // under the project the same way other docs are organised); fall back
  // to opportunity_id so the file still lands in a deterministic location
  // for pre-Won inspections.
  const folderId = oppRow.project_id ?? args.opportunityId
  const ts = Date.now()
  const storagePath = `${args.tenantId}/${folderId}/inspection-report-${ts}.html`
  const fileName = `inspection-report-${args.inspectionId.slice(0, 8)}-${ts}.html`
  const bytes = Buffer.from(html, 'utf-8')

  const admin = createSupabaseAdminClient()
  const { error: uploadErr } = await admin.storage
    .from('documents')
    .upload(storagePath, bytes, { contentType: 'text/html; charset=utf-8', upsert: false })
  if (uploadErr) {
    throw new Error(`storage upload: ${uploadErr.message}`)
  }

  const [doc] = await db
    .insert(documents)
    .values({
      tenant_id: args.tenantId,
      project_id: oppRow.project_id,
      opportunity_id: args.opportunityId,
      uploaded_by: args.actorId,
      document_type: 'other',
      file_name: fileName,
      storage_path: storagePath,
      mime_type: 'text/html; charset=utf-8',
      size_bytes: bytes.length,
      description: `Site Inspection Report (auto-generated) for inspection ${args.inspectionId}`,
    })
    .returning({ id: documents.id })

  if (!doc) return

  await db
    .update(siteInspections)
    .set({ pdf_document_id: doc.id, updated_at: new Date() })
    .where(
      and(
        eq(siteInspections.id, args.inspectionId),
        eq(siteInspections.tenant_id, args.tenantId)
      )
    )
}

export async function submitInspection(opportunityId: string, formData: FormData) {
  const traceId = randomUUID()
  let tenantId: string | null = null
  let actorId: string | null = null
  const action = 'site_inspection.submit' as const
  try {
    const profile = await requireUserProfile()
    tenantId = profile.tenantId
    actorId = profile.user.id
    if (!can(profile.role, 'site_inspection.submit')) {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'forbidden' })
      return { ok: false as const, error: 'You do not have permission to submit a site inspection.' }
    }

    const fields = readExactTextFields(
      formData, INSPECTION_FIELD_NAMES, INSPECTION_FIELD_NAME_SET,
    )
    if (!fields.ok) {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'validation_error' })
      return { ok: false as const, error: fields.error }
    }

    let photoDocumentIds: unknown
    try {
      photoDocumentIds = JSON.parse(fields.values.photo_document_ids)
    } catch {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'validation_error' })
      return { ok: false as const, error: 'photo_document_ids: must be a JSON array of UUIDs' }
    }
    const command = siteInspectionSubmissionCommandSchema.safeParse({
      kind: 'inspection_submission',
      submissionId: fields.values.client_submission_id,
      opportunityId,
      payload: {
        siteAddress: fields.values.site_address,
        floorAreaSqm: fields.values.floor_area_sqm,
        landlordContact: fields.values.landlord_contact,
        asBuiltAvailable: fields.values.as_built_available,
        expectedStartDate: fields.values.expected_start_date,
        weather: fields.values.weather,
        accessibilityNotes: fields.values.accessibility_notes,
        observations: fields.values.observations,
      },
      photoDocumentIds,
    })
    if (!command.success) {
      const first = command.error.errors[0]
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'validation_error' })
      return { ok: false as const, error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
    }

    const rawResult = await siteInspectionWorkflowService.submitInspection(
      { tenantId, userId: actorId }, command.data,
    )
    const checked = siteInspectionWorkflowResultSchema.safeParse(rawResult)
    if (!checked.success) {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'service_contract_failure' })
      return { ok: false as const, error: 'The inspection service returned an invalid response. Please retry.' }
    }
    if (!checked.data.ok) {
      logSiteInspectionOutcome({
        traceId, tenantId, actorId, action, outcome: 'service_rejected',
        errorCode: checked.data.error.code,
      })
      return { ok: false as const, error: checked.data.error.message }
    }
    if (
      checked.data.kind !== 'inspection_submission' ||
      checked.data.tenantId !== tenantId ||
      checked.data.actorId !== actorId ||
      checked.data.opportunityId !== opportunityId ||
      checked.data.status !== 'submitted' ||
      checked.data.linkedPhotoCount !== command.data.photoDocumentIds.length
    ) {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'service_contract_failure' })
      return { ok: false as const, error: 'The inspection service response did not match this submission. Please retry.' }
    }

    let archiveWarning: string | undefined
    if (!checked.data.replayed) {
      try {
        await persistInspectionReport({
          tenantId,
          actorId,
          inspectionId: checked.data.inspectionId,
          opportunityId,
          payload: {
            site_address: command.data.payload.siteAddress,
            floor_area_sqm: command.data.payload.floorAreaSqm,
            landlord_contact: command.data.payload.landlordContact,
            as_built_available: command.data.payload.asBuiltAvailable,
            expected_start_date: command.data.payload.expectedStartDate,
            weather: command.data.payload.weather,
            accessibility_notes: command.data.payload.accessibilityNotes,
            observations: command.data.payload.observations,
          },
          photoDocumentIds: command.data.photoDocumentIds,
        })
      } catch {
        archiveWarning = 'The inspection was submitted, but its report could not be archived. Retry the report repair later.'
      }
    }

    let refreshFailed = false
    try {
      revalidatePath(`/crm/opportunities/${opportunityId}/proposal/inspection`)
      revalidatePath(`/crm/opportunities/${opportunityId}/proposal`)
    } catch {
      refreshFailed = true
    }
    const outcome = archiveWarning && refreshFailed
      ? 'success_archive_and_refresh_failed'
      : archiveWarning
        ? 'success_archive_failed'
        : refreshFailed
          ? 'success_refresh_failed'
          : checked.data.replayed ? 'success_replayed' : 'success'
    logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome })
    return {
      ok: true as const,
      inspectionId: checked.data.inspectionId,
      replayed: checked.data.replayed,
      refreshFailed,
      archiveWarning,
    }
  } catch {
    logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'unexpected_error' })
    return { ok: false as const, error: 'Unable to submit the inspection. Please retry.' }
  }
}

export async function addInspectionRfi(
  opportunityId: string,
  inspectionId: string,
  formData: FormData,
) {
  const traceId = randomUUID()
  let tenantId: string | null = null
  let actorId: string | null = null
  const action = 'site_inspection_rfi.create' as const
  try {
    const profile = await requireUserProfile()
    tenantId = profile.tenantId
    actorId = profile.user.id
    if (!can(profile.role, 'site_inspection.submit')) {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'forbidden' })
      return { ok: false as const, error: 'You do not have permission to add an inspection RFI.' }
    }
    const fields = readExactTextFields(formData, RFI_FIELD_NAMES, RFI_FIELD_NAME_SET)
    if (!fields.ok) {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'validation_error' })
      return { ok: false as const, error: fields.error }
    }
    const command = siteInspectionRfiCommandSchema.safeParse({
      kind: 'rfi_creation',
      submissionId: fields.values.submission_id,
      opportunityId,
      inspectionId,
      description: fields.values.description,
      priority: fields.values.priority,
    })
    if (!command.success) {
      const first = command.error.errors[0]
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'validation_error' })
      return { ok: false as const, error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
    }

    const rawResult = await siteInspectionWorkflowService.createRfi(
      { tenantId, userId: actorId }, command.data,
    )
    const checked = siteInspectionWorkflowResultSchema.safeParse(rawResult)
    if (!checked.success) {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'service_contract_failure' })
      return { ok: false as const, error: 'The RFI service returned an invalid response. Please retry.' }
    }
    if (!checked.data.ok) {
      logSiteInspectionOutcome({
        traceId, tenantId, actorId, action, outcome: 'service_rejected',
        errorCode: checked.data.error.code,
      })
      return { ok: false as const, error: checked.data.error.message }
    }
    if (
      checked.data.kind !== 'rfi_creation' ||
      checked.data.tenantId !== tenantId ||
      checked.data.actorId !== actorId ||
      checked.data.opportunityId !== opportunityId ||
      checked.data.inspectionId !== inspectionId ||
      checked.data.priority !== command.data.priority
    ) {
      logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'service_contract_failure' })
      return { ok: false as const, error: 'The RFI service response did not match this request. Please retry.' }
    }

    let refreshFailed = false
    try {
      revalidatePath(`/crm/opportunities/${opportunityId}/proposal/inspection`)
    } catch {
      refreshFailed = true
    }
    logSiteInspectionOutcome({
      traceId, tenantId, actorId, action,
      outcome: refreshFailed ? 'success_refresh_failed' : checked.data.replayed ? 'success_replayed' : 'success',
    })
    return {
      ok: true as const,
      rfiId: checked.data.rfiId,
      replayed: checked.data.replayed,
      refreshFailed,
    }
  } catch {
    logSiteInspectionOutcome({ traceId, tenantId, actorId, action, outcome: 'unexpected_error' })
    return { ok: false as const, error: 'Unable to add the RFI. Please retry.' }
  }
}

// US-008 — Upload a design file version. Creates the design_files row if
// missing for the opp/file_type pair (so "Initial Layout v1, v2..." stays
// grouped), then writes a new design_file_versions row.
const uploadDesignFileSchema = z.object({
  opportunity_id: z.string().uuid(),
  file_type: z.enum(DESIGN_FILE_TYPE_VALUES),
  name: z.string().min(1).max(255),
  document_id: z.string().uuid(),
  notes: z.string().max(2000).optional().default(''),
  design_file_id: z.string().uuid().optional(),
})

export async function uploadDesignFile(formData: FormData): Promise<{ error?: string; design_file_id?: string; version?: number }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'design.upload')
  if (forbid) return { error: forbid }

  const parsed = uploadDesignFileSchema.safeParse({
    opportunity_id: formData.get('opportunity_id'),
    file_type: formData.get('file_type'),
    name: formData.get('name'),
    document_id: formData.get('document_id'),
    notes: formData.get('notes') || '',
    design_file_id: formData.get('design_file_id') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  const opp = await assertOpportunity(profile.tenantId, input.opportunity_id)
  if (!opp) return { error: 'Opportunity not found' }

  // Confirm the document exists in this tenant.
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, input.document_id), eq(documents.tenant_id, profile.tenantId)))
    .limit(1)
  if (!doc) return { error: 'Document not found' }

  let designFileId = input.design_file_id ?? null
  if (designFileId) {
    const [existing] = await db
      .select({ id: designFiles.id })
      .from(designFiles)
      .where(
        and(
          eq(designFiles.id, designFileId),
          eq(designFiles.tenant_id, profile.tenantId),
          eq(designFiles.opportunity_id, input.opportunity_id)
        )
      )
      .limit(1)
    if (!existing) designFileId = null
  }

  if (!designFileId) {
    const [created] = await db
      .insert(designFiles)
      .values({
        tenant_id: profile.tenantId,
        opportunity_id: input.opportunity_id,
        file_type: input.file_type,
        name: input.name,
      })
      .returning({ id: designFiles.id })
    designFileId = created!.id

    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'design_file',
      entityId: designFileId,
      action: 'create',
      diff: { file_type: input.file_type, name: input.name },
    })
  }

  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${designFileVersions.version}), 0)` })
    .from(designFileVersions)
    .where(
      and(
        eq(designFileVersions.design_file_id, designFileId),
        eq(designFileVersions.tenant_id, profile.tenantId)
      )
    )
  const nextVersion = (maxRow?.max ?? 0) + 1

  const [version] = await db
    .insert(designFileVersions)
    .values({
      tenant_id: profile.tenantId,
      design_file_id: designFileId,
      version: nextVersion,
      document_id: input.document_id,
      notes: input.notes || null,
      uploaded_by: profile.user.id,
    })
    .returning({ id: designFileVersions.id })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'design_file_version',
    entityId: version!.id,
    action: 'create',
    diff: { design_file_id: designFileId, version: nextVersion, document_id: input.document_id },
  })

  revalidatePath(`/crm/opportunities/${input.opportunity_id}/proposal/design`)
  revalidatePath(`/crm/opportunities/${input.opportunity_id}/proposal`)
  return { design_file_id: designFileId, version: nextVersion }
}

const designIdSchema = z.object({
  design_file_id: z.string().uuid(),
})

async function loadDesignFile(tenantId: string, designFileId: string) {
  const [row] = await db
    .select({
      id: designFiles.id,
      opportunity_id: designFiles.opportunity_id,
      is_ready_for_presentation: designFiles.is_ready_for_presentation,
      is_client_approved: designFiles.is_client_approved,
      name: designFiles.name,
    })
    .from(designFiles)
    .where(and(eq(designFiles.id, designFileId), eq(designFiles.tenant_id, tenantId)))
    .limit(1)
  return row ?? null
}

// US-008 #3 — Mark a design "Ready for Presentation" and notify Sales.
export async function markDesignReady(designFileId: string): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'design.ready_for_presentation')
  if (forbid) return { error: forbid }

  const parsed = designIdSchema.safeParse({ design_file_id: designFileId })
  if (!parsed.success) return { error: 'invalid design_file_id' }

  const row = await loadDesignFile(profile.tenantId, parsed.data.design_file_id)
  if (!row) return { error: 'Design file not found' }

  await db
    .update(designFiles)
    .set({ is_ready_for_presentation: true, updated_at: new Date() })
    .where(
      and(
        eq(designFiles.id, parsed.data.design_file_id),
        eq(designFiles.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'design_file',
    entityId: parsed.data.design_file_id,
    action: 'update',
    diff: { is_ready_for_presentation: { before: row.is_ready_for_presentation, after: true } },
  })

  await startSlaClock({
    tenantId: profile.tenantId,
    entityType: 'opportunity',
    entityId: row.opportunity_id,
    label: 'design.client_presentation',
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['sales'],
    subject: `Design "${row.name}" ready for presentation`,
    body: 'A design file has been marked ready for client presentation.',
    linkUrl: `/crm/opportunities/${row.opportunity_id}/proposal/design`,
  })

  revalidatePath(`/crm/opportunities/${row.opportunity_id}/proposal/design`)
  revalidatePath(`/crm/opportunities/${row.opportunity_id}/proposal`)
  return {}
}

// US-008 #5 — Client signs off → lock the design version.
export async function markDesignApproved(designFileId: string): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'design.approve_client')
  if (forbid) return { error: forbid }

  const parsed = designIdSchema.safeParse({ design_file_id: designFileId })
  if (!parsed.success) return { error: 'invalid design_file_id' }

  const row = await loadDesignFile(profile.tenantId, parsed.data.design_file_id)
  if (!row) return { error: 'Design file not found' }

  const now = new Date()
  await db
    .update(designFiles)
    .set({
      is_client_approved: true,
      client_approved_at: now,
      updated_at: now,
    })
    .where(
      and(
        eq(designFiles.id, parsed.data.design_file_id),
        eq(designFiles.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'design_file',
    entityId: parsed.data.design_file_id,
    action: 'approve',
    diff: { is_client_approved: { before: row.is_client_approved, after: true } },
  })

  revalidatePath(`/crm/opportunities/${row.opportunity_id}/proposal/design`)
  revalidatePath(`/crm/opportunities/${row.opportunity_id}/proposal`)
  return {}
}

// US-009 — Log a client change request. The idempotency key is supplied by
// the browser form so retries cannot create duplicate requests or duplicate
// change-log entries.
const logCrSchema = z.object({
  opportunity_id: z.string().uuid(),
  requested_by_name: z.string().trim().min(1).max(255),
  description: z.string().trim().min(2).max(5000),
  priority: z.enum(PRIORITY_VALUES).default('minor'),
  affected_design_file_id: z.string().uuid().optional(),
  idempotency_key: z.string().trim().min(1).max(256).optional(),
})

export async function logChangeRequest(formData: FormData): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'change_request.create')
  if (forbid) return { error: forbid }

  const affected = formData.get('affected_design_file_id')
  const parsed = logCrSchema.safeParse({
    opportunity_id: formData.get('opportunity_id'),
    requested_by_name: formData.get('requested_by_name'),
    description: formData.get('description'),
    priority: formData.get('priority') || 'minor',
    affected_design_file_id: typeof affected === 'string' && affected.length > 0 ? affected : undefined,
    idempotency_key: formData.get('idempotency_key') ?? undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  if (changeRequestWritesUseCoreApi(profile.tenantId)) {
    const requestedIdempotencyKey = input.idempotency_key
    const idempotencyKey =
      requestedIdempotencyKey && requestedIdempotencyKey.trim().length > 0
        ? requestedIdempotencyKey.trim()
        : randomUUID()
    const coreResult = await createChangeRequestThroughCoreApi(
      input.opportunity_id,
      {
        requestedByName: input.requested_by_name,
        description: input.description,
        priority: input.priority,
        affectedDesignFileId: input.affected_design_file_id ?? null,
      },
      idempotencyKey,
    )
    if (!coreResult.ok || !coreResult.data) {
      return {
        error:
          coreResult.error ??
          'Change Request could not be created through ERP Core.',
      }
    }
    revalidatePath(
      `/crm/opportunities/${input.opportunity_id}/proposal/change-requests`,
    )
    revalidatePath(`/crm/opportunities/${input.opportunity_id}/proposal`)
    return {}
  }

  let result: {
    error?: string
    changeRequestId?: string
    replayed?: boolean
  }
  try {
    result = await db.transaction((tx) =>
      createChangeRequestRecord(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        opportunityId: input.opportunity_id,
        requestedByName: input.requested_by_name,
        description: input.description,
        priority: input.priority as ChangeRequestPriority,
        affectedDesignFileId: input.affected_design_file_id ?? null,
        idempotencyKey: input.idempotency_key ?? randomUUID(),
      }),
    )
  } catch (error: unknown) {
    logProposalActionFailure({
      action: 'change_request.create',
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      opportunityId: input.opportunity_id,
      error,
    })
    return { error: 'Change request could not be saved. Retry the submission.' }
  }

  if (result.error) return { error: result.error }
  if (!result.changeRequestId) return { error: 'Change request could not be saved.' }

  if (result.replayed) {
    revalidatePath(`/crm/opportunities/${input.opportunity_id}/proposal/change-requests`)
    return {}
  }

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['design'],
    subject: `New change request (${input.priority})`,
    body: `Change requested by ${input.requested_by_name}: ${input.description.slice(0, 140)}`,
    linkUrl: `/crm/opportunities/${input.opportunity_id}/proposal/change-requests`,
  })

  revalidatePath(`/crm/opportunities/${input.opportunity_id}/proposal/change-requests`)
  revalidatePath(`/crm/opportunities/${input.opportunity_id}/proposal`)
  return {}
}

// US-009 — Design resolves a request. Resolution is append-only in the
// domain log; the summary row is updated only to make open-count queries fast.
const resolveCrSchema = z.object({
  change_request_id: z.string().uuid(),
  resolution_note: z.string().trim().max(2000).optional().default(''),
})

export async function resolveChangeRequest(formData: FormData): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'design.upload')
  if (forbid) return { error: forbid }

  const parsed = resolveCrSchema.safeParse({
    change_request_id: formData.get('change_request_id'),
    resolution_note: formData.get('resolution_note') || '',
  })
  if (!parsed.success) return { error: 'Invalid change request resolution.' }

  const input = parsed.data
  let result: { error?: string; opportunityId?: string; alreadyResolved?: boolean }
  try {
    result = await db.transaction((tx) =>
      resolveChangeRequestRecord(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        changeRequestId: input.change_request_id,
        resolutionNote: input.resolution_note,
      }),
    )
  } catch (error: unknown) {
    logProposalActionFailure({
      action: 'change_request.resolve',
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      changeRequestId: input.change_request_id,
      error,
    })
    return { error: 'Change request could not be resolved. Retry the action.' }
  }

  if (result.error) return { error: result.error }
  if (!result.opportunityId) return { error: 'Change request could not be resolved.' }
  if (!result.alreadyResolved) {
    await notifyRoles({
      tenantId: profile.tenantId,
      recipientRoles: ['sales'],
      subject: 'Change request resolved',
      body: 'A design change request has been resolved and is ready for review.',
      linkUrl: `/crm/opportunities/${result.opportunityId}/proposal/change-requests`,
    })
  }

  revalidatePath(`/crm/opportunities/${result.opportunityId}/proposal/change-requests`)
  revalidatePath(`/crm/opportunities/${result.opportunityId}/proposal`)
  return {}
}

// US-009 #4 — "Approve without changes": locks the current design and
// kicks off the BOM-generation Inngest pipeline.
export async function approveWithoutChanges(designFileId: string): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'design.approve_client')
  if (forbid) return { error: forbid }

  const parsed = designIdSchema.safeParse({ design_file_id: designFileId })
  if (!parsed.success) return { error: 'invalid design_file_id' }

  const row = await loadDesignFile(profile.tenantId, parsed.data.design_file_id)
  if (!row) return { error: 'Design file not found' }

  const now = new Date()
  await db
    .update(designFiles)
    .set({
      is_client_approved: true,
      client_approved_at: now,
      updated_at: now,
    })
    .where(
      and(
        eq(designFiles.id, parsed.data.design_file_id),
        eq(designFiles.tenant_id, profile.tenantId)
      )
    )

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'design_file',
    entityId: parsed.data.design_file_id,
    action: 'lock',
    diff: { reason: 'approved_without_changes' },
  })

  await inngest.send({
    name: 'bom/generation.requested',
    data: {
      tenantId: profile.tenantId,
      opportunityId: row.opportunity_id,
      designFileId: parsed.data.design_file_id,
      actorId: profile.user.id,
    },
  })

  revalidatePath(`/crm/opportunities/${row.opportunity_id}/proposal/design`)
  revalidatePath(`/crm/opportunities/${row.opportunity_id}/proposal`)
  return {}
}

// Read helper: latest PPRF row (for forms + summaries). Exported because the
// PPRF page server component re-uses it.
export async function getLatestPprf(tenantId: string, opportunityId: string) {
  const [row] = await db
    .select()
    .from(pprfSubmissions)
    .where(
      and(
        eq(pprfSubmissions.opportunity_id, opportunityId),
        eq(pprfSubmissions.tenant_id, tenantId)
      )
    )
    .orderBy(desc(pprfSubmissions.version))
    .limit(1)
  return row ?? null
}

// schema re-export removed — import directly from './schemas' instead.
