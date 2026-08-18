'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, desc, or, sql } from 'drizzle-orm'
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
  siteInspectionPhotos,
  siteInspectionRfis,
  designFiles,
  designFileVersions,
  opportunities,
  documents,
  accounts,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import { writeAuditLog, writeAuditLogInTransaction } from '@/lib/audit'
import {
  changeRequestWritesUseCoreApi,
  createChangeRequestThroughCoreApi,
} from '@/lib/erp-core-client'
import { startSlaClock } from '@/lib/operations/sla-clock'
import { notifyRoles } from '@/lib/operations/notifications'
import {
  initializeOpportunityKycTracks,
  opportunityKycDueAt,
} from '@/lib/operations/opportunity-kyc'
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
import { submitPprfSchema, type PprfPayload } from './schemas'
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

// US-006 — Submit a new versioned PPRF for an opportunity.
export async function submitPprf(formData: FormData): Promise<{ error?: string; version?: number }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'pprf.submit')
  if (forbid) return { error: forbid }

  const parsed = submitPprfSchema.safeParse({
    opportunity_id: formData.get('opportunity_id'),
    site_address: formData.get('site_address'),
    floor_area_sqm: formData.get('floor_area_sqm'),
    landlord_contact: formData.get('landlord_contact'),
    as_built_available: formData.get('as_built_available'),
    scope_notes: formData.get('scope_notes') || '',
    project_type: formData.get('project_type') || '',
    expected_start_date: formData.get('expected_start_date') || '',
    budget_range: formData.get('budget_range') || '',
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const { opportunity_id, ...payload } = parsed.data

  const opp = await assertOpportunity(profile.tenantId, opportunity_id)
  if (!opp) return { error: 'Opportunity not found' }

  const dueAt = await opportunityKycDueAt(profile.tenantId)
  const result = await db.transaction(async (tx) => {
    // Serialize versioning and track reset for concurrent submissions of one
    // opportunity. A later PPRF is a new review baseline, never a partial edit
    // of an already-decided track.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'pprf:' + profile.tenantId + ':' + opportunity_id}, 0))`
    )

    const [maxRow] = await tx
      .select({ max: sql<number>`COALESCE(MAX(${pprfSubmissions.version}), 0)` })
      .from(pprfSubmissions)
      .where(
        and(
          eq(pprfSubmissions.opportunity_id, opportunity_id),
          eq(pprfSubmissions.tenant_id, profile.tenantId),
        ),
      )
    const nextVersion = (maxRow?.max ?? 0) + 1
    const now = new Date()
    const [inserted] = await tx
      .insert(pprfSubmissions)
      .values({
        tenant_id: profile.tenantId,
        opportunity_id,
        version: nextVersion,
        payload,
        submitted_at: now,
        submitted_by: profile.user.id,
      })
      .returning({ id: pprfSubmissions.id })

    if (!inserted) throw new Error('Failed to persist PPRF submission')

    await initializeOpportunityKycTracks(tx, {
      tenantId: profile.tenantId,
      opportunityId: opportunity_id,
      dueAt,
    })

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'pprf_submission',
      entityId: inserted.id,
      action: 'create',
      diff: {
        version: nextVersion,
        opportunity_id,
        payload,
        kyc_tracks_reset: true,
        kyc_due_at: dueAt.toISOString(),
      },
    })

    return { nextVersion }
  })
  const nextVersion = result.nextVersion

  await startSlaClock({
    tenantId: profile.tenantId,
    entityType: 'opportunity',
    entityId: opportunity_id,
    label: 'pprf.review',
  })

  await notifyRoles({
    tenantId: profile.tenantId,
    recipientRoles: ['commercial', 'finance'],
    subject: `PPRF v${nextVersion} submitted`,
    body: `A new Project Pre-Requirements Form (v${nextVersion}) is ready for review.`,
    linkUrl: `/crm/opportunities/${opportunity_id}/proposal/pprf`,
  })

  revalidatePath(`/crm/opportunities/${opportunity_id}/proposal/pprf`)
  revalidatePath(`/crm/opportunities/${opportunity_id}/proposal`)
  revalidatePath(`/crm/opportunities/${opportunity_id}`)
  return { version: nextVersion }
}

// US-007 — Submit a site inspection. Requires a PPRF to already exist.
const inspectionPayloadSchema = z.object({
  site_address: z.string().min(2).max(500),
  floor_area_sqm: z.string().max(64).optional().default(''),
  landlord_contact: z.string().max(255).optional().default(''),
  as_built_available: z.enum(['yes', 'partial', 'no']).optional().default('no'),
  expected_start_date: z.string().max(64).optional().default(''),
  weather: z.string().max(255).optional().default(''),
  accessibility_notes: z.string().max(5000).optional().default(''),
  observations: z.string().max(20_000).optional().default(''),
})

const submitInspectionSchema = z.object({
  opportunity_id: z.string().uuid(),
  client_submission_id: z.string().uuid(),
  photo_document_ids: z.string().optional().default('[]'),
}).merge(inspectionPayloadSchema)

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

export async function submitInspection(formData: FormData): Promise<{ error?: string; id?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'site_inspection.submit')
  if (forbid) return { error: forbid }

  const parsed = submitInspectionSchema.safeParse({
    opportunity_id: formData.get('opportunity_id'),
    client_submission_id: formData.get('client_submission_id'),
    site_address: formData.get('site_address'),
    floor_area_sqm: formData.get('floor_area_sqm') || '',
    landlord_contact: formData.get('landlord_contact') || '',
    as_built_available: formData.get('as_built_available') || 'no',
    expected_start_date: formData.get('expected_start_date') || '',
    weather: formData.get('weather') || '',
    accessibility_notes: formData.get('accessibility_notes') || '',
    observations: formData.get('observations') || '',
    photo_document_ids: formData.get('photo_document_ids') || '[]',
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const { opportunity_id, client_submission_id, photo_document_ids, ...payload } = parsed.data

  const opp = await assertOpportunity(profile.tenantId, opportunity_id)
  if (!opp) return { error: 'Opportunity not found' }

  // US-007 #1 — PPRF must be submitted first.
  const [existingPprf] = await db
    .select({ id: pprfSubmissions.id })
    .from(pprfSubmissions)
    .where(
      and(
        eq(pprfSubmissions.opportunity_id, opportunity_id),
        eq(pprfSubmissions.tenant_id, profile.tenantId)
      )
    )
    .limit(1)
  if (!existingPprf) {
    return { error: 'PPRF must be submitted before logging a site inspection.' }
  }

  let photoIds: string[] = []
  try {
    const raw = JSON.parse(photo_document_ids)
    if (Array.isArray(raw)) {
      photoIds = raw
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .slice(0, 30)
    }
  } catch {
    return { error: 'photo_document_ids must be a JSON array of UUIDs.' }
  }

  const result = await db.transaction(async (tx) => {
    // The browser keeps this token in IndexedDB. Serialize retries for one
    // tenant/token pair so reconnects cannot create duplicate inspections or
    // duplicate audit/SLA notifications.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'site-inspection:' + profile.tenantId + ':' + client_submission_id}, 0))`
    )

    const [existing] = await tx
      .select({ id: siteInspections.id, opportunity_id: siteInspections.opportunity_id })
      .from(siteInspections)
      .where(
        and(
          eq(siteInspections.tenant_id, profile.tenantId),
          eq(siteInspections.client_submission_id, client_submission_id),
        ),
      )
      .limit(1)

    if (existing) {
      if (existing.opportunity_id !== opportunity_id) {
        return { id: null, replayed: false, conflict: true }
      }
      return { id: existing.id, replayed: true, conflict: false }
    }

    const now = new Date()
    const [inserted] = await tx
      .insert(siteInspections)
      .values({
        tenant_id: profile.tenantId,
        opportunity_id,
        client_submission_id,
        status: 'submitted',
        payload,
        submitted_at: now,
        submitted_by: profile.user.id,
      })
      .returning({ id: siteInspections.id })

    if (!inserted) throw new Error('Failed to persist site inspection')

    if (photoIds.length > 0) {
      // Confirm each document belongs to the tenant before linking.
      const docs = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.tenant_id, profile.tenantId),
            opp.project_id
              ? or(
                  eq(documents.opportunity_id, opportunity_id),
                  eq(documents.project_id, opp.project_id),
                )
              : eq(documents.opportunity_id, opportunity_id),
          ),
        )
      const allowed = new Set(docs.map((d) => d.id))
      const safePhotos = photoIds.filter((p) => allowed.has(p))
      if (safePhotos.length > 0) {
        await tx.insert(siteInspectionPhotos).values(
          safePhotos.map((document_id) => ({
            tenant_id: profile.tenantId,
            inspection_id: inserted.id,
            document_id,
          }))
        )
      }
    }

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'site_inspection',
      entityId: inserted.id,
      action: 'create',
      diff: {
        opportunity_id,
        client_submission_id,
        payload,
        photo_count: photoIds.length,
      },
    })

    return { id: inserted.id, replayed: false, conflict: false }
  })

  if (result.conflict || !result.id) {
    return { error: 'This inspection token was already used for another opportunity.' }
  }

  // US-007 #5 — Auto-generate the report HTML and archive it as a document
  // so it lands in the Document Vault. We deliberately don't render PDF
  // server-side (no Puppeteer); the saved HTML is print-clean via @page
  // CSS and converts via "Print → Save as PDF". Storage failures don't
  // roll back the inspection — we just log a warning and continue.
  if (!result.replayed) {
    await persistInspectionReport({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      inspectionId: result.id,
      opportunityId: opportunity_id,
      payload,
      photoDocumentIds: photoIds,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'unknown error'

      console.warn(
        `[site-inspection] report archival failed for ${result.id}: ${message}`
      )
    })
  }

  if (!result.replayed) {
    await startSlaClock({
      tenantId: profile.tenantId,
      entityType: 'opportunity',
      entityId: opportunity_id,
      label: 'inspection.design_handoff',
    })

    await notifyRoles({
      tenantId: profile.tenantId,
      recipientRoles: ['design'],
      subject: 'Site Inspection ready for design',
      body: 'A new site inspection report has been submitted. Design can begin layouts.',
      linkUrl: `/crm/opportunities/${opportunity_id}/proposal/inspection`,
    })
  }

  revalidatePath(`/crm/opportunities/${opportunity_id}/proposal/inspection`)
  revalidatePath(`/crm/opportunities/${opportunity_id}/proposal`)
  return { id: result.id }
}

const rfiSchema = z.object({
  inspection_id: z.string().uuid(),
  opportunity_id: z.string().uuid(),
  description: z.string().min(2).max(2000),
  priority: z.enum(PRIORITY_VALUES).default('minor'),
})

export async function addInspectionRfi(formData: FormData): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const forbid = guard(profile.role, 'site_inspection.submit')
  if (forbid) return { error: forbid }

  const parsed = rfiSchema.safeParse({
    inspection_id: formData.get('inspection_id'),
    opportunity_id: formData.get('opportunity_id'),
    description: formData.get('description'),
    priority: formData.get('priority') || 'minor',
  })
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const input = parsed.data

  // Verify inspection belongs to the caller's tenant.
  const [inspection] = await db
    .select({ id: siteInspections.id })
    .from(siteInspections)
    .where(
      and(
        eq(siteInspections.id, input.inspection_id),
        eq(siteInspections.tenant_id, profile.tenantId),
        eq(siteInspections.opportunity_id, input.opportunity_id),
      )
    )
    .limit(1)
  if (!inspection) return { error: 'Inspection not found' }

  const [created] = await db
    .insert(siteInspectionRfis)
    .values({
      tenant_id: profile.tenantId,
      inspection_id: input.inspection_id,
      description: input.description,
      priority: input.priority,
    })
    .returning({ id: siteInspectionRfis.id })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'site_inspection_rfi',
    entityId: created!.id,
    action: 'create',
    diff: { description: input.description, priority: input.priority },
  })

  revalidatePath(`/crm/opportunities/${input.opportunity_id}/proposal/inspection`)
  return {}
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
  const forbid = guard(profile.role, 'design.upload')
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
  const forbid = guard(profile.role, 'design.upload')
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
  const forbid = guard(profile.role, 'design.upload')
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
