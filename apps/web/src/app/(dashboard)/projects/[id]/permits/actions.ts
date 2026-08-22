'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, ilike, or } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  mobilizationReadiness,
  permitDurationProfiles,
  permits,
  preConChecklists,
  preConChecklistItems,
  projects,
  users,
} from '@third-code-erp/database/schema'
import { philippineBusinessDays } from '@third-code-erp/shared-types'
import { z } from 'zod'
import { writeAuditLogInTransaction, writeAuditLog } from '@/lib/audit'
import { startSlaClock, stopSlaClock } from '@/lib/operations/sla-clock'

const permitTypeSchema = z.enum([
  'building_admin_vetting',
  'lgu_building_permit',
  'dole_permit',
  'occupancy_permit',
  'cari',
  'performance_bond',
  'surety_bond',
  'construction_bond',
])
const permitStatusSchema = z.enum([
  'not_started',
  'submitted',
  'additional_docs_required',
  'under_review',
  'approved',
  'rejected',
  'released',
  'refunded',
  'cancelled',
])
const mobilizationInputSchema = z.enum([
  'commented_fcd_received_at',
  'po_copies_received_at',
  'cari_received_at',
  'ntp_received_at',
])

type PermitType = z.infer<typeof permitTypeSchema>
type PermitStatus = z.infer<typeof permitStatusSchema>
type MobilizationInput = z.infer<typeof mobilizationInputSchema>

const terminalPermitStatuses: PermitStatus[] = [
  'approved',
  'rejected',
  'released',
  'refunded',
  'cancelled',
]

const permitFormSchema = z.object({
  projectId: z.string().uuid(),
  permitType: permitTypeSchema,
  lguName: z.string().trim().max(160).optional(),
  responsibleUserId: z.string().uuid().optional(),
  submittedAt: z.string().trim().max(40).optional(),
  expectedReturnAt: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(10_000).optional(),
})

function permitCapabilityError(
  profile: Awaited<ReturnType<typeof requireUserProfile>>,
  permitType?: PermitType,
): string | null {
  if (can(profile.role, 'precon.manage_permits')) return null
  if (permitType === 'dole_permit' && can(profile.role, 'safety.dole_permit.manage')) {
    return null
  }
  return 'Your role cannot manage this permit or mobilization readiness.'
}

function parseDateInput(raw: string | undefined): Date | null {
  if (!raw) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw
  const value = new Date(normalized)
  return Number.isNaN(value.getTime()) ? null : value
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addBusinessDays(value: Date, days: number): Date {
  return new Date(`${philippineBusinessDays.add(dateOnly(value), days)}T00:00:00.000Z`)
}

function parseDurationInputs(formData: FormData):
  | { error: string }
  | { min: number | null; expected: number | null; max: number | null } {
  const raw = ['min_duration_days', 'expected_duration_days', 'max_duration_days'].map((key) =>
    String(formData.get(key) ?? '').trim()
  )
  const values = raw.map((value) => (value ? Number(value) : null))
  if (values.some((value) => value !== null && (!Number.isInteger(value) || value < 0))) {
    return { error: 'Duration values must be whole numbers from zero upward.' }
  }
  const min = values[0] ?? null
  const expected = values[1] ?? null
  const max = values[2] ?? null
  if ((min === null) !== (expected === null) || (expected === null) !== (max === null)) {
    return { error: 'Enter minimum, expected, and maximum duration together.' }
  }
  if (min !== null && expected !== null && max !== null && !(min <= expected && expected <= max)) {
    return { error: 'Duration values must satisfy minimum ≤ expected ≤ maximum.' }
  }
  return { min, expected, max }
}

function parsePermitForm(formData: FormData):
  | { error: string }
  | {
      data: z.infer<typeof permitFormSchema>
      submittedAt: Date | null
      expectedReturnAt: Date | null
      durations: { min: number | null; expected: number | null; max: number | null }
    } {
  const parsed = permitFormSchema.safeParse({
    projectId: String(formData.get('project_id') ?? ''),
    permitType: String(formData.get('permit_type') ?? ''),
    lguName: String(formData.get('lgu_name') ?? '').trim() || undefined,
    responsibleUserId: String(formData.get('responsible_user_id') ?? '').trim() || undefined,
    submittedAt: String(formData.get('submitted_at') ?? '').trim() || undefined,
    expectedReturnAt:
      String(formData.get('expected_return_at') ?? formData.get('expected_approval_at') ?? '').trim() ||
      undefined,
    notes: String(formData.get('notes') ?? '').trim() || undefined,
  })
  if (!parsed.success) return { error: 'Invalid permit details.' }

  const submittedAt = parseDateInput(parsed.data.submittedAt)
  const expectedReturnAt = parseDateInput(parsed.data.expectedReturnAt)
  if (parsed.data.submittedAt && !submittedAt) return { error: 'Submitted date is invalid.' }
  if (parsed.data.expectedReturnAt && !expectedReturnAt) return { error: 'Expected return date is invalid.' }

  const durations = parseDurationInputs(formData)
  if ('error' in durations) return durations
  if ((durations.min !== null || durations.expected !== null || durations.max !== null) && !parsed.data.lguName) {
    return { error: 'LGU / issuing authority is required when setting a duration profile.' }
  }

  return { data: parsed.data, submittedAt, expectedReturnAt, durations }
}

async function resolveDurationProfile(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  args: {
    tenantId: string
    actorId: string
    lguName: string | undefined
    permitType: PermitType
    min: number | null
    expected: number | null
    max: number | null
  }
) {
  if (!args.lguName) return null

  if (args.min !== null && args.expected !== null && args.max !== null) {
    const [profile] = await tx
      .insert(permitDurationProfiles)
      .values({
        tenant_id: args.tenantId,
        lgu_name: args.lguName,
        permit_type: args.permitType,
        min_duration_days: args.min,
        expected_duration_days: args.expected,
        max_duration_days: args.max,
        created_by: args.actorId,
        updated_by: args.actorId,
      })
      .onConflictDoUpdate({
        target: [
          permitDurationProfiles.tenant_id,
          permitDurationProfiles.lgu_name,
          permitDurationProfiles.permit_type,
        ],
        set: {
          min_duration_days: args.min,
          expected_duration_days: args.expected,
          max_duration_days: args.max,
          updated_by: args.actorId,
          updated_at: new Date(),
        },
      })
      .returning()
    return profile ?? null
  }

  const [profile] = await tx
    .select()
    .from(permitDurationProfiles)
    .where(
      and(
        eq(permitDurationProfiles.tenant_id, args.tenantId),
        eq(permitDurationProfiles.lgu_name, args.lguName),
        eq(permitDurationProfiles.permit_type, args.permitType)
      )
    )
    .limit(1)
  return profile ?? null
}

/** Create a permit, snapshotting the current external-return forecast. */
export async function createPermit(
  formData: FormData
): Promise<{ error?: string; permitId?: string }> {
  const profile = await requireUserProfile()
  const parsed = parsePermitForm(formData)
  if ('error' in parsed) return parsed
  const { data, submittedAt, expectedReturnAt, durations } = parsed
  const capabilityError = permitCapabilityError(profile, data.permitType)
  if (capabilityError) return { error: capabilityError }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, data.projectId), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found.' }

  if (data.responsibleUserId) {
    const [responsible] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, data.responsibleUserId), eq(users.tenant_id, profile.tenantId)))
      .limit(1)
    if (!responsible) return { error: 'Responsible person is not in this workspace.' }
  }

  const initialStatus: PermitStatus = submittedAt ? 'submitted' : 'not_started'
  try {
    const created = await db.transaction(async (tx) => {
      const durationProfile = await resolveDurationProfile(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        lguName: data.lguName,
        permitType: data.permitType,
        min: durations.min,
        expected: durations.expected,
        max: durations.max,
      })
      const derivedExpected =
        expectedReturnAt ??
        (submittedAt && durationProfile
          ? addBusinessDays(submittedAt, durationProfile.expected_duration_days)
          : null)
      const escalationAt =
        submittedAt && durationProfile
          ? addBusinessDays(submittedAt, durationProfile.max_duration_days)
          : derivedExpected

      const [row] = await tx
        .insert(permits)
        .values({
          tenant_id: profile.tenantId,
          project_id: data.projectId,
          permit_type: data.permitType,
          status: initialStatus,
          submitted_at: submittedAt,
          expected_approval_at: derivedExpected,
          expected_return_at: derivedExpected,
          lgu_name: data.lguName,
          responsible_user_id: data.responsibleUserId,
          duration_profile_id: durationProfile?.id,
          min_duration_days: durationProfile?.min_duration_days,
          expected_duration_days: durationProfile?.expected_duration_days,
          max_duration_days: durationProfile?.max_duration_days,
          escalation_at: escalationAt,
          notes: data.notes,
          created_by: profile.user.id,
          updated_by: profile.user.id,
        })
        .returning({ id: permits.id })
      if (!row) throw new Error('Permit insert returned no row')

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'permit',
        entityId: row.id,
        action: 'create',
        diff: {
          project_id: data.projectId,
          permit_type: data.permitType,
          status: initialStatus,
          expected_return_at: derivedExpected?.toISOString() ?? null,
          duration_profile_id: durationProfile?.id ?? null,
        },
      })
      return row
    })

    if (initialStatus === 'submitted') {
      await startSlaClock({
        tenantId: profile.tenantId,
        entityType: 'permit',
        entityId: created.id,
        label: 'permit.status_update',
      })
    }

    revalidatePermitPaths(data.projectId)
    return { permitId: created.id }
  } catch {
    return { error: 'Permit could not be created. Check the details and try again.' }
  }
}

/**
 * Move a permit through its status flow. Completion records actual return
 * time and updates the LGU duration profile exactly once per permit.
 */
export async function updatePermitStatus(
  permitId: string,
  newStatus: PermitStatus
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const parsedPermitId = z.string().uuid().safeParse(permitId)
  const parsedStatus = permitStatusSchema.safeParse(newStatus)
  if (!parsedPermitId.success || !parsedStatus.success) return { error: 'Invalid permit update.' }

  const [permissionRow] = await db
    .select({ permit_type: permits.permit_type })
    .from(permits)
    .where(and(eq(permits.id, parsedPermitId.data), eq(permits.tenant_id, profile.tenantId)))
    .limit(1)
  if (!permissionRow) return { error: 'Permit not found.' }
  const capabilityError = permitCapabilityError(profile, permissionRow.permit_type)
  if (capabilityError) return { error: capabilityError }

  try {
    const result = await db.transaction(async (tx) => {
      const [permit] = await tx
        .select({
          id: permits.id,
          project_id: permits.project_id,
          permit_type: permits.permit_type,
          status: permits.status,
          submitted_at: permits.submitted_at,
          actual_return_at: permits.actual_return_at,
          lgu_name: permits.lgu_name,
        })
        .from(permits)
        .where(and(eq(permits.id, parsedPermitId.data), eq(permits.tenant_id, profile.tenantId)))
        .limit(1)
      if (!permit) return null

      const now = new Date()
      const update: Partial<typeof permits.$inferInsert> = {
        status: parsedStatus.data,
        last_status_change_at: now,
        updated_at: now,
        updated_by: profile.user.id,
      }
      if (parsedStatus.data === 'submitted' && !permit.submitted_at) update.submitted_at = now
      if (parsedStatus.data === 'approved' && !permit.actual_return_at) update.approved_at = now
      if (['approved', 'released', 'refunded'].includes(parsedStatus.data) && !permit.actual_return_at) {
        update.actual_return_at = now
      }
      if (parsedStatus.data === 'refunded') update.refunded_at = now

      await tx
        .update(permits)
        .set(update)
        .where(and(eq(permits.id, permit.id), eq(permits.tenant_id, profile.tenantId)))

      let learnedDays: number | null = null
      if (
        terminalPermitStatuses.includes(parsedStatus.data) &&
        !permit.actual_return_at &&
        permit.permit_type === 'lgu_building_permit' &&
        permit.lgu_name &&
        permit.submitted_at
      ) {
        learnedDays = Math.max(
          0,
          philippineBusinessDays.between(dateOnly(permit.submitted_at), dateOnly(now))
        )
        await learnPermitDuration(tx, {
          tenantId: profile.tenantId,
          actorId: profile.user.id,
          lguName: permit.lgu_name,
          permitType: permit.permit_type,
          observedDays: learnedDays,
        })
      }

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'permit',
        entityId: permit.id,
        action: 'status_change',
        diff: {
          from: permit.status,
          to: parsedStatus.data,
          actual_return_at: update.actual_return_at?.toISOString() ?? null,
          learned_duration_days: learnedDays,
        },
      })
      return { projectId: permit.project_id, permitType: permit.permit_type }
    })

    if (!result) return { error: 'Permit not found.' }

    if (parsedStatus.data === 'submitted') {
      await startSlaClock({
        tenantId: profile.tenantId,
        entityType: 'permit',
        entityId: parsedPermitId.data,
        label: 'permit.status_update',
      })
    }
    if (terminalPermitStatuses.includes(parsedStatus.data)) {
      await stopSlaClock({
        tenantId: profile.tenantId,
        entityType: 'permit',
        entityId: parsedPermitId.data,
      })
    }

    if (parsedStatus.data === 'approved') {
      await markMatchingChecklistItemDone({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        projectId: result.projectId,
        permitType: result.permitType,
      })
    }

    revalidatePermitPaths(result.projectId)
    revalidatePath(`/projects/${result.projectId}/checklist`)
    return {}
  } catch {
    return { error: 'Permit status could not be updated.' }
  }
}

async function learnPermitDuration(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  args: {
    tenantId: string
    actorId: string
    lguName: string
    permitType: PermitType
    observedDays: number
  }
): Promise<void> {
  const [current] = await tx
    .select()
    .from(permitDurationProfiles)
    .where(
      and(
        eq(permitDurationProfiles.tenant_id, args.tenantId),
        eq(permitDurationProfiles.lgu_name, args.lguName),
        eq(permitDurationProfiles.permit_type, args.permitType)
      )
    )
    .limit(1)

  if (!current) {
    await tx.insert(permitDurationProfiles).values({
      tenant_id: args.tenantId,
      lgu_name: args.lguName,
      permit_type: args.permitType,
      min_duration_days: args.observedDays,
      expected_duration_days: args.observedDays,
      max_duration_days: args.observedDays,
      observed_count: 1,
      last_observed_days: args.observedDays,
      last_observed_at: new Date(),
      created_by: args.actorId,
      updated_by: args.actorId,
    })
    return
  }

  const observedCount = current.observed_count + 1
  const expectedDuration = Math.round(
    (current.expected_duration_days * current.observed_count + args.observedDays) / observedCount
  )
  await tx
    .update(permitDurationProfiles)
    .set({
      min_duration_days: Math.min(current.min_duration_days, args.observedDays),
      expected_duration_days: expectedDuration,
      max_duration_days: Math.max(current.max_duration_days, args.observedDays),
      observed_count: observedCount,
      last_observed_days: args.observedDays,
      last_observed_at: new Date(),
      updated_by: args.actorId,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(permitDurationProfiles.id, current.id),
        eq(permitDurationProfiles.tenant_id, args.tenantId)
      )
    )
}

/** Record one of the four external returns used by the mobilization gate. */
export async function recordMobilizationInput(
  projectId: string,
  inputType: MobilizationInput,
  receivedAtRaw?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const capabilityError = permitCapabilityError(profile)
  if (capabilityError) return { error: capabilityError }

  const parsedProjectId = z.string().uuid().safeParse(projectId)
  const parsedInput = mobilizationInputSchema.safeParse(inputType)
  if (!parsedProjectId.success || !parsedInput.success) return { error: 'Invalid mobilization input.' }
  const receivedAt = parseDateInput(receivedAtRaw) ?? new Date()

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, parsedProjectId.data), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found.' }

  try {
    const result = await db.transaction(async (tx) => {
      const current = await tx
        .select({ id: mobilizationReadiness.id, started_at: mobilizationReadiness.started_at })
        .from(mobilizationReadiness)
        .where(
          and(
            eq(mobilizationReadiness.project_id, parsedProjectId.data),
            eq(mobilizationReadiness.tenant_id, profile.tenantId)
          )
        )
        .limit(1)
      if (current[0]?.started_at) return { alreadyStarted: true }

      const inputUpdate = mobilizationInputUpdate(parsedInput.data, receivedAt)
      let readinessId = current[0]?.id
      if (current[0]) {
        await tx
          .update(mobilizationReadiness)
          .set({ ...inputUpdate, updated_by: profile.user.id, updated_at: new Date() })
          .where(
            and(
              eq(mobilizationReadiness.id, current[0].id),
              eq(mobilizationReadiness.tenant_id, profile.tenantId)
            )
          )
      } else {
        const [inserted] = await tx
          .insert(mobilizationReadiness)
          .values({
            tenant_id: profile.tenantId,
            project_id: parsedProjectId.data,
            ...inputUpdate,
            created_by: profile.user.id,
            updated_by: profile.user.id,
          })
          .returning({ id: mobilizationReadiness.id })
        readinessId = inserted?.id
      }
      if (!readinessId) throw new Error('Readiness row was not created')
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'mobilization_readiness',
        entityId: readinessId,
        action: 'update',
        diff: { input_type: parsedInput.data, received_at: receivedAt.toISOString() },
      })
      return { alreadyStarted: false }
    })
    if (result.alreadyStarted) return { error: 'Mobilization is already started; evidence is immutable.' }
    revalidatePermitPaths(parsedProjectId.data)
    return {}
  } catch {
    return { error: 'Mobilization input could not be recorded.' }
  }
}

/** Start mobilization only when all returns are present or an override is audited. */
export async function startMobilization(
  projectId: string,
  overrideReasonRaw?: string
): Promise<{ error?: string; startedAt?: string }> {
  const profile = await requireUserProfile()
  const capabilityError = permitCapabilityError(profile)
  if (capabilityError) return { error: capabilityError }

  const parsedProjectId = z.string().uuid().safeParse(projectId)
  if (!parsedProjectId.success) return { error: 'Invalid project id.' }
  const overrideReason = (overrideReasonRaw ?? '').trim()
  if (overrideReason && !can(profile.role, 'precon.override_mobilization')) {
    return { error: 'Your role cannot authorize a mobilization override.' }
  }
  if (overrideReason.length > 500) return { error: 'Override reason is too long.' }

  try {
    const result = await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, parsedProjectId.data), eq(projects.tenant_id, profile.tenantId)))
        .limit(1)
      if (!project) return { error: 'Project not found.' as const }

      const [current] = await tx
        .select()
        .from(mobilizationReadiness)
        .where(
          and(
            eq(mobilizationReadiness.project_id, parsedProjectId.data),
            eq(mobilizationReadiness.tenant_id, profile.tenantId)
          )
        )
        .limit(1)
      if (current?.started_at) return { startedAt: current.started_at.toISOString() as string }

      const complete = Boolean(
        current?.commented_fcd_received_at &&
          current.po_copies_received_at &&
          current.cari_received_at &&
          current.ntp_received_at
      )
      if (!complete && !overrideReason) {
        return { error: 'Mobilization requires all four returns or an authorized override.' as const }
      }

      const now = new Date()
      const values = {
        started_at: now,
        started_by: profile.user.id,
        override_reason: overrideReason || null,
        override_at: overrideReason ? now : null,
        override_by: overrideReason ? profile.user.id : null,
        updated_by: profile.user.id,
        updated_at: now,
      }
      let readinessId = current?.id
      if (current) {
        await tx
          .update(mobilizationReadiness)
          .set(values)
          .where(
            and(
              eq(mobilizationReadiness.id, current.id),
              eq(mobilizationReadiness.tenant_id, profile.tenantId)
            )
          )
      } else {
        const [inserted] = await tx
          .insert(mobilizationReadiness)
          .values({
            tenant_id: profile.tenantId,
            project_id: parsedProjectId.data,
            ...values,
            created_by: profile.user.id,
          })
          .returning({ id: mobilizationReadiness.id })
        readinessId = inserted?.id
      }
      if (!readinessId) throw new Error('Readiness row was not created')

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'mobilization_readiness',
        entityId: readinessId,
        action: 'status_change',
        diff: {
          to: 'started',
          override: Boolean(overrideReason),
          override_reason: overrideReason || null,
          missing_inputs: complete ? [] : readinessMissingInputs(current),
        },
      })
      return { startedAt: now.toISOString() as string }
    })

    if ('error' in result) return { error: result.error }
    revalidatePermitPaths(parsedProjectId.data)
    return result
  } catch {
    return { error: 'Mobilization could not be started.' }
  }
}

/** Escalate a late external return with an explicit actor and reason. */
export async function escalatePermit(
  permitId: string,
  reasonRaw: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  const parsedPermitId = z.string().uuid().safeParse(permitId)
  const reason = reasonRaw.trim()
  if (!parsedPermitId.success || reason.length < 3 || reason.length > 500) {
    return { error: 'Provide a clear escalation reason.' }
  }

  const [permissionRow] = await db
    .select({ permit_type: permits.permit_type })
    .from(permits)
    .where(and(eq(permits.id, parsedPermitId.data), eq(permits.tenant_id, profile.tenantId)))
    .limit(1)
  if (!permissionRow) return { error: 'Permit not found.' }
  const capabilityError = permitCapabilityError(profile, permissionRow.permit_type)
  if (capabilityError) return { error: capabilityError }

  try {
    const result = await db.transaction(async (tx) => {
      const [permit] = await tx
        .select({ project_id: permits.project_id })
        .from(permits)
        .where(and(eq(permits.id, parsedPermitId.data), eq(permits.tenant_id, profile.tenantId)))
        .limit(1)
      if (!permit) return null
      const now = new Date()
      await tx
        .update(permits)
        .set({ escalated_at: now, escalation_reason: reason, updated_by: profile.user.id, updated_at: now })
        .where(and(eq(permits.id, parsedPermitId.data), eq(permits.tenant_id, profile.tenantId)))
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'permit',
        entityId: parsedPermitId.data,
        action: 'update',
        diff: { escalated_at: now.toISOString(), escalation_reason: reason },
      })
      return permit
    })
    if (!result) return { error: 'Permit not found.' }
    revalidatePermitPaths(result.project_id)
    return {}
  } catch {
    return { error: 'Permit escalation could not be recorded.' }
  }
}

function mobilizationInputUpdate(
  inputType: MobilizationInput,
  receivedAt: Date
): Partial<typeof mobilizationReadiness.$inferInsert> {
  switch (inputType) {
    case 'commented_fcd_received_at':
      return { commented_fcd_received_at: receivedAt }
    case 'po_copies_received_at':
      return { po_copies_received_at: receivedAt }
    case 'cari_received_at':
      return { cari_received_at: receivedAt }
    case 'ntp_received_at':
      return { ntp_received_at: receivedAt }
  }
}

function readinessMissingInputs(
  readiness: typeof mobilizationReadiness.$inferSelect | undefined
): string[] {
  if (!readiness) return ['commented_fcd', 'po_copies', 'cari', 'ntp']
  const missing: string[] = []
  if (!readiness.commented_fcd_received_at) missing.push('commented_fcd')
  if (!readiness.po_copies_received_at) missing.push('po_copies')
  if (!readiness.cari_received_at) missing.push('cari')
  if (!readiness.ntp_received_at) missing.push('ntp')
  return missing
}

/** Mark the matching Pre-Con checklist item when an applicable permit lands. */
async function markMatchingChecklistItemDone(args: {
  tenantId: string
  actorId: string
  projectId: string
  permitType: PermitType
}): Promise<void> {
  const [checklist] = await db
    .select({ id: preConChecklists.id })
    .from(preConChecklists)
    .where(and(eq(preConChecklists.project_id, args.projectId), eq(preConChecklists.tenant_id, args.tenantId)))
    .limit(1)
  if (!checklist) return

  const patterns: Partial<Record<PermitType, string[]>> = {
    building_admin_vetting: ['Building Admin Vetting'],
    lgu_building_permit: ['LGU Building Permit'],
    dole_permit: ['DOLE permit'],
    occupancy_permit: ['Occupancy Permit'],
  }
  const candidates = patterns[args.permitType] ?? []
  if (candidates.length === 0) return

  const [item] = await db
    .select({ id: preConChecklistItems.id, status: preConChecklistItems.status, title: preConChecklistItems.title })
    .from(preConChecklistItems)
    .where(
      and(
        eq(preConChecklistItems.checklist_id, checklist.id),
        eq(preConChecklistItems.tenant_id, args.tenantId),
        or(...candidates.map((candidate) => ilike(preConChecklistItems.title, `%${candidate}%`)))
      )
    )
    .limit(1)
  if (!item || item.status === 'done') return

  const now = new Date()
  await db
    .update(preConChecklistItems)
    .set({ status: 'done', completed_at: now, completed_by: args.actorId, updated_at: now })
    .where(and(eq(preConChecklistItems.id, item.id), eq(preConChecklistItems.tenant_id, args.tenantId)))
  await stopSlaClock({ tenantId: args.tenantId, entityType: 'pre_con_checklist_item', entityId: item.id })
  await writeAuditLog({
    tenantId: args.tenantId,
    actorId: args.actorId,
    entityType: 'pre_con_checklist_item',
    entityId: item.id,
    action: 'status_change',
    diff: { source: 'permit.approved', status: { from: item.status, to: 'done' }, title: item.title },
  })
}

function revalidatePermitPaths(projectId: string): void {
  revalidatePath(`/projects/${projectId}/permits`)
  revalidatePath('/permits')
}

/** Form-bound wrapper for the status selector. */
export async function updatePermitStatusForm(formData: FormData): Promise<{ error?: string }> {
  const permitId = String(formData.get('permit_id') ?? '')
  const newStatus = String(formData.get('status') ?? '')
  if (!permitId) return { error: 'Missing permit id.' }
  const parsedStatus = permitStatusSchema.safeParse(newStatus)
  if (!parsedStatus.success) return { error: 'Invalid permit status.' }
  return updatePermitStatus(permitId, parsedStatus.data)
}
