'use server'

/**
 * Server actions for "My Tasks" surface (REFACTOR.md M5 US-Con-001).
 *
 * - completeTask: single-tap completion with optional notes. Audit-logged.
 *                 If a corresponding SLA clock is open it is stopped.
 * - triggerDailyGeneration: emits a `cadence/generate.requested` event for
 *                 the caller's tenant. Restricted to admin/owner.
 */

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { dailyTasks } from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { stopSlaClock } from '@/lib/operations/sla-clock'
import { inngest } from '@/lib/inngest'

const MAX_NOTES_LENGTH = 2_000

interface ActionResult {
  error?: string
  ok?: true
}

export async function completeTask(taskId: string, notes?: string): Promise<ActionResult> {
  if (typeof taskId !== 'string' || taskId.length === 0) {
    return { error: 'taskId required' }
  }

  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }

  const trimmedNotes =
    typeof notes === 'string' ? notes.trim().slice(0, MAX_NOTES_LENGTH) : undefined

  // Look up the task under the caller's tenant. Tenant-scoping is the security
  // boundary — we don't allow completing someone else's task across tenants.
  const [task] = await db
    .select({
      id: dailyTasks.id,
      project_id: dailyTasks.project_id,
      assignee_id: dailyTasks.assignee_id,
      status: dailyTasks.status,
    })
    .from(dailyTasks)
    .where(and(eq(dailyTasks.id, taskId), eq(dailyTasks.tenant_id, profile.tenantId)))
    .limit(1)

  if (!task) return { error: 'Task not found' }
  if (task.status === 'done') {
    // Idempotent: tell the caller everything is fine without writing.
    return { ok: true }
  }

  // Allow assignees to self-complete; admin/owner can complete any task in tenant.
  const isAssignee = task.assignee_id === profile.user.id
  const isPrivileged = profile.role === 'admin' || profile.role === 'owner'
  if (!isAssignee && !isPrivileged) {
    return { error: 'Forbidden' }
  }

  const now = new Date()
  await db
    .update(dailyTasks)
    .set({
      status: 'done',
      completed_at: now,
      completed_by: profile.user.id,
      completion_notes: trimmedNotes && trimmedNotes.length > 0 ? trimmedNotes : null,
    })
    .where(and(eq(dailyTasks.id, taskId), eq(dailyTasks.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'daily_task',
    entityId: taskId,
    action: 'update',
    diff: {
      status: { before: task.status, after: 'done' },
      notes_provided: Boolean(trimmedNotes && trimmedNotes.length > 0),
    },
  })

  // Best-effort: stop any open SLA clock for this task entity.
  try {
    await stopSlaClock({
      tenantId: profile.tenantId,
      entityType: 'daily_task',
      entityId: taskId,
    })
  } catch (err) {
    // Don't block completion on SLA bookkeeping.
    console.warn('[completeTask] stopSlaClock failed:', err)
  }

  revalidatePath('/tasks')
  return { ok: true }
}

export async function triggerDailyGeneration(): Promise<ActionResult> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }

  if (profile.role !== 'admin' && profile.role !== 'owner') {
    return { error: 'Forbidden' }
  }

  try {
    await inngest.send({
      name: 'cadence/generate.requested',
      data: {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
      },
    })
  } catch (err) {
    console.warn('[triggerDailyGeneration] inngest.send failed:', err)
    return { error: 'Could not enqueue generation' }
  }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'cadence',
    entityId: profile.tenantId,
    action: 'create',
    diff: { event: 'cadence/generate.requested' },
  })

  revalidatePath('/tasks')
  return { ok: true }
}
