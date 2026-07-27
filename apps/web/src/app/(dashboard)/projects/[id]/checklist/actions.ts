'use server'

import { revalidatePath } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { preConChecklistItems } from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { startSlaClock, stopSlaClock } from '@/lib/operations/sla-clock'

type ChecklistItemStatus = 'not_started' | 'in_progress' | 'blocked' | 'done'

const STATUSES: ChecklistItemStatus[] = ['not_started', 'in_progress', 'blocked', 'done']

/**
 * REFACTOR.md M4 US-Pre-001 — owner of a checklist item moves it through
 * not_started → in_progress → blocked → done.
 *
 * Side-effects:
 *   - in_progress: start SLA clock (entity_type=pre_con_checklist_item) and
 *     stamp sla_clock_started_at if it wasn't already.
 *   - blocked: blocker_reason is required.
 *   - done: stamp completed_at + completed_by, stop SLA, and start the SLA
 *     clock for every item whose depends_on_item_id == this id.
 */
export async function updateChecklistItemStatus(
  itemId: string,
  status: ChecklistItemStatus,
  blockerReason?: string,
  attachmentDocumentId?: string
): Promise<{ error?: string }> {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'precon.manage_checklist')) {
    return { error: `Forbidden: role "${profile.role}" lacks "precon.manage_checklist"` }
  }
  if (!STATUSES.includes(status)) {
    return { error: `Invalid status "${status}"` }
  }
  if (status === 'blocked' && !blockerReason?.trim()) {
    return { error: 'Blocker reason is required when moving to blocked.' }
  }

  const [item] = await db
    .select({
      id: preConChecklistItems.id,
      tenant_id: preConChecklistItems.tenant_id,
      checklist_id: preConChecklistItems.checklist_id,
      status: preConChecklistItems.status,
      title: preConChecklistItems.title,
      sla_clock_started_at: preConChecklistItems.sla_clock_started_at,
    })
    .from(preConChecklistItems)
    .where(
      and(
        eq(preConChecklistItems.id, itemId),
        eq(preConChecklistItems.tenant_id, profile.tenantId)
      )
    )
    .limit(1)

  if (!item) return { error: 'Checklist item not found' }

  const now = new Date()
  const before = item.status

  const updateValues: Partial<typeof preConChecklistItems.$inferInsert> = {
    status,
    blocker_reason: status === 'blocked' ? blockerReason!.trim() : null,
    updated_at: now,
  }

  if (attachmentDocumentId) {
    updateValues.attachment_document_id = attachmentDocumentId
  }

  // Start the SLA clock the first time we move into in_progress.
  if (status === 'in_progress' && !item.sla_clock_started_at) {
    updateValues.sla_clock_started_at = now
  }

  if (status === 'done') {
    updateValues.completed_at = now
    updateValues.completed_by = profile.user.id
  } else {
    updateValues.completed_at = null
    updateValues.completed_by = null
  }

  await db
    .update(preConChecklistItems)
    .set(updateValues)
    .where(
      and(
        eq(preConChecklistItems.id, itemId),
        eq(preConChecklistItems.tenant_id, profile.tenantId)
      )
    )

  // SLA log coordination — we store a parallel row in `sla_logs` so the
  // edge sla-checker can warn/breach independently of any UI rendering.
  if (status === 'in_progress') {
    await startSlaClock({
      tenantId: profile.tenantId,
      entityType: 'pre_con_checklist_item',
      entityId: itemId,
      label: 'precon.checklist_item',
    })
  }
  if (status === 'done') {
    await stopSlaClock({
      tenantId: profile.tenantId,
      entityType: 'pre_con_checklist_item',
      entityId: itemId,
    })

    // Cascade: any dependent item that has not yet started its clock now
    // becomes eligible. Single UPDATE is cheaper than fan-out per child.
    await db
      .update(preConChecklistItems)
      .set({ sla_clock_started_at: now })
      .where(
        and(
          eq(preConChecklistItems.depends_on_item_id, itemId),
          eq(preConChecklistItems.tenant_id, profile.tenantId),
          isNull(preConChecklistItems.sla_clock_started_at)
        )
      )
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'pre_con_checklist_item',
    entityId: itemId,
    action: 'status_change',
    diff: {
      status: { from: before, to: status },
      title: item.title,
      blocker_reason: blockerReason?.trim() ?? null,
      attachment_document_id: attachmentDocumentId ?? null,
    },
  })

  return {}
}

/**
 * Convenience server-action wrapper for the row component. Accepts a
 * FormData payload so the row can use a plain <form action={...}>.
 */
export async function updateChecklistItemStatusForm(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const itemId = String(formData.get('item_id') ?? '')
  const status = String(formData.get('status') ?? '') as ChecklistItemStatus
  const blockerReason = String(formData.get('blocker_reason') ?? '').trim() || undefined
  const attachmentDocumentId = String(formData.get('attachment_document_id') ?? '').trim() || undefined

  if (!itemId) return { error: 'Missing checklist item id' }

  const result = await updateChecklistItemStatus(
    itemId,
    status,
    blockerReason,
    attachmentDocumentId
  )

  if (!result.error) revalidatePath(`/projects/${projectId}/checklist`)
  return result
}
