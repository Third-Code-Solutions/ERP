'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, ilike, or } from 'drizzle-orm'
import { requireUserProfile } from '@buildops/auth'
import { db } from '@buildops/database'
import {
  permits,
  preConChecklists,
  preConChecklistItems,
  projects,
} from '@buildops/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { startSlaClock, stopSlaClock } from '@/lib/abi/sla-clock'

type PermitType = 'building_admin_vetting' | 'lgu_building_permit' | 'dole_permit'
type PermitStatus =
  | 'not_started'
  | 'submitted'
  | 'additional_docs_required'
  | 'under_review'
  | 'approved'
  | 'rejected'

const PERMIT_TYPES: PermitType[] = [
  'building_admin_vetting',
  'lgu_building_permit',
  'dole_permit',
]

const PERMIT_STATUSES: PermitStatus[] = [
  'not_started',
  'submitted',
  'additional_docs_required',
  'under_review',
  'approved',
  'rejected',
]

/**
 * REFACTOR.md M4 US-Pre-002 — create a permit row attached to a project.
 *
 * The form posts the project_id, permit_type, optional submitted_at and
 * expected_approval_at. SLA tracking starts when status moves past
 * 'not_started' (handled in updatePermitStatus).
 */
export async function createPermit(formData: FormData): Promise<{ error?: string; permitId?: string }> {
  const profile = await requireUserProfile()

  const projectId = String(formData.get('project_id') ?? '')
  const permitType = String(formData.get('permit_type') ?? '') as PermitType
  const notes = String(formData.get('notes') ?? '').trim() || null
  const submittedAtRaw = String(formData.get('submitted_at') ?? '').trim()
  const expectedAtRaw = String(formData.get('expected_approval_at') ?? '').trim()

  if (!projectId) return { error: 'Missing project id' }
  if (!PERMIT_TYPES.includes(permitType)) return { error: 'Invalid permit type' }

  // Tenant ownership check.
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return { error: 'Project not found' }

  const submittedAt = submittedAtRaw ? safeDate(submittedAtRaw) : null
  const expectedAt = expectedAtRaw ? safeDate(expectedAtRaw) : null
  const initialStatus: PermitStatus = submittedAt ? 'submitted' : 'not_started'

  const [created] = await db
    .insert(permits)
    .values({
      tenant_id: profile.tenantId,
      project_id: projectId,
      permit_type: permitType,
      status: initialStatus,
      submitted_at: submittedAt,
      expected_approval_at: expectedAt,
      notes,
    })
    .returning({ id: permits.id })

  if (!created) return { error: 'Failed to create permit' }

  if (initialStatus === 'submitted') {
    await startSlaClock({
      tenantId: profile.tenantId,
      entityType: 'permit',
      entityId: created.id,
      label: 'permit.status_update',
    })
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'permit',
    entityId: created.id,
    action: 'create',
    diff: {
      project_id: projectId,
      permit_type: permitType,
      status: initialStatus,
    },
  })

  revalidatePath(`/projects/${projectId}/permits`)
  revalidatePath('/permits')
  return { permitId: created.id }
}

/**
 * Move a permit through its status flow. On 'approved' we best-effort mark
 * the matching Pre-Con checklist item ("Permit"/"LGU"/"DOLE" in title) as
 * done so the two trackers stay in lockstep.
 */
export async function updatePermitStatus(
  permitId: string,
  newStatus: PermitStatus
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()

  if (!PERMIT_STATUSES.includes(newStatus)) {
    return { error: `Invalid permit status "${newStatus}"` }
  }

  const [permit] = await db
    .select({
      id: permits.id,
      tenant_id: permits.tenant_id,
      project_id: permits.project_id,
      permit_type: permits.permit_type,
      status: permits.status,
    })
    .from(permits)
    .where(and(eq(permits.id, permitId), eq(permits.tenant_id, profile.tenantId)))
    .limit(1)

  if (!permit) return { error: 'Permit not found' }

  const now = new Date()
  const update: Partial<typeof permits.$inferInsert> = {
    status: newStatus,
    last_status_change_at: now,
    updated_at: now,
  }
  if (newStatus === 'submitted' && !permit.status) {
    update.submitted_at = now
  }
  if (newStatus === 'approved') {
    update.approved_at = now
  }

  await db
    .update(permits)
    .set(update)
    .where(and(eq(permits.id, permitId), eq(permits.tenant_id, profile.tenantId)))

  if (newStatus === 'submitted') {
    await startSlaClock({
      tenantId: profile.tenantId,
      entityType: 'permit',
      entityId: permitId,
      label: 'permit.status_update',
    })
  }
  if (newStatus === 'approved' || newStatus === 'rejected') {
    await stopSlaClock({
      tenantId: profile.tenantId,
      entityType: 'permit',
      entityId: permitId,
    })
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'permit',
    entityId: permitId,
    action: 'status_change',
    diff: { from: permit.status, to: newStatus },
  })

  if (newStatus === 'approved') {
    await markMatchingChecklistItemDone({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      projectId: permit.project_id,
      permitType: permit.permit_type as PermitType,
    })
  }

  revalidatePath(`/projects/${permit.project_id}/permits`)
  revalidatePath(`/projects/${permit.project_id}/checklist`)
  revalidatePath('/permits')
  return {}
}

/**
 * Heuristic: find the matching Pre-Con checklist item (by title substring)
 * and mark it done. We don't fail the permit update if the lookup misses —
 * it's a convenience, not a hard contract.
 */
async function markMatchingChecklistItemDone(args: {
  tenantId: string
  actorId: string
  projectId: string
  permitType: PermitType
}): Promise<void> {
  const [checklist] = await db
    .select({ id: preConChecklists.id })
    .from(preConChecklists)
    .where(
      and(
        eq(preConChecklists.project_id, args.projectId),
        eq(preConChecklists.tenant_id, args.tenantId)
      )
    )
    .limit(1)
  if (!checklist) return

  // Pick the title pattern by permit type. Falls back to plain "permit"
  // which matches both LGU and DOLE rows, but item #3 won't match — that's
  // fine since we have an explicit pattern for it below.
  const patterns: Record<PermitType, string[]> = {
    building_admin_vetting: ['Building Admin Vetting'],
    lgu_building_permit: ['LGU Building Permit'],
    dole_permit: ['DOLE permit'],
  }

  const candidates = patterns[args.permitType] ?? []
  if (candidates.length === 0) return

  const matched = await db
    .select({
      id: preConChecklistItems.id,
      status: preConChecklistItems.status,
      title: preConChecklistItems.title,
    })
    .from(preConChecklistItems)
    .where(
      and(
        eq(preConChecklistItems.checklist_id, checklist.id),
        eq(preConChecklistItems.tenant_id, args.tenantId),
        or(...candidates.map((p) => ilike(preConChecklistItems.title, `%${p}%`)))
      )
    )
    .limit(1)

  const item = matched[0]
  if (!item || item.status === 'done') return

  const now = new Date()
  await db
    .update(preConChecklistItems)
    .set({
      status: 'done',
      completed_at: now,
      completed_by: args.actorId,
      updated_at: now,
    })
    .where(eq(preConChecklistItems.id, item.id))

  await stopSlaClock({
    tenantId: args.tenantId,
    entityType: 'pre_con_checklist_item',
    entityId: item.id,
  })

  await writeAuditLog({
    tenantId: args.tenantId,
    actorId: args.actorId,
    entityType: 'pre_con_checklist_item',
    entityId: item.id,
    action: 'status_change',
    diff: {
      source: 'permit.approved',
      status: { from: item.status, to: 'done' },
      title: item.title,
    },
  })
}

function safeDate(raw: string): Date | null {
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Convenience form-bound wrapper so client components can pass the id via
 * a hidden input rather than binding.
 */
export async function updatePermitStatusForm(
  formData: FormData
): Promise<{ error?: string }> {
  const permitId = String(formData.get('permit_id') ?? '')
  const newStatus = String(formData.get('status') ?? '') as PermitStatus
  if (!permitId) return { error: 'Missing permit id' }
  return updatePermitStatus(permitId, newStatus)
}
