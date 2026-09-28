'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  updateTaskStatusCommandSchema,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import {
  completeAwardTaskThroughCoreApi,
  updateProcessTaskStatusThroughCoreApi,
} from '@/lib/erp-core-client'

export interface ProcessTaskStatusActionResult {
  ok: boolean
  error?: string
  refreshWarning?: string
}

const taskIdSchema = z.string().uuid()

/**
 * Server-only boundary for task status changes. Core remains authoritative for
 * tenant ownership and the current-state transition; this action only accepts
 * the strict command shape and refreshes the Process Health projection after a
 * verified commit.
 */
export async function updateProcessTaskStatus(
  formData: FormData
): Promise<ProcessTaskStatusActionResult> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { ok: false, error: 'Unauthorized' }
  if (!can(profile.role, 'process.task.manage')) {
    return {
      ok: false,
      error: 'You do not have permission to update process tasks.',
    }
  }

  const parsedTaskId = taskIdSchema.safeParse(formData.get('taskId'))
  if (!parsedTaskId.success) {
    return { ok: false, error: 'Invalid process task identifier.' }
  }

  const blockedReason = formData.get('blockedReason')
  const parsedCommand = updateTaskStatusCommandSchema.safeParse({
    status: formData.get('status'),
    blockedReason: blockedReason === null ? undefined : blockedReason,
  })
  if (!parsedCommand.success) {
    return {
      ok: false,
      error:
        parsedCommand.error.issues[0]?.message ??
        'Invalid process task status command.',
    }
  }

  const result = await updateProcessTaskStatusThroughCoreApi(
    parsedTaskId.data,
    parsedCommand.data
  )
  if (!result.ok || !result.data) {
    return {
      ok: false,
      error: result.error ?? 'Process task status was not updated.',
    }
  }

  revalidatePath('/process')
  return { ok: true }
}

/** Core rechecks the active award, tenant, BU and unblocked task state. */
export async function completeAwardTask(
  formData: FormData
): Promise<ProcessTaskStatusActionResult> {
  const traceId = randomUUID()
  let tenantId: string | null = null
  let actorId: string | null = null
  let outcome = 'rejected'
  try {
    const profile = await requireUserProfile().catch(() => null)
    if (!profile) return { ok: false, error: 'Unauthorized' }
    tenantId = profile.tenantId
    actorId = profile.user.id
    if (!can(profile.role, 'process.award_task.participate')) {
      return { ok: false, error: 'You do not have permission to complete award tasks.' }
    }
    const parsedTaskId = taskIdSchema.safeParse(formData.get('taskId'))
    if (!parsedTaskId.success) {
      return { ok: false, error: 'Invalid process task identifier.' }
    }
    const result = await completeAwardTaskThroughCoreApi(parsedTaskId.data)
    if (!result.ok || !result.data) {
      return { ok: false, error: result.error ?? 'Award task was not completed.' }
    }
    outcome = 'succeeded'
    try {
      revalidatePath('/process')
    } catch {
      outcome = 'succeeded_refresh_pending'
      return { ok: true, refreshWarning: 'Task completed. Refresh to see the updated queue.' }
    }
    return { ok: true }
  } catch {
    outcome = 'unconfirmed'
    return { ok: false, error: 'Unable to confirm completion. Refresh before trying again.' }
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: actorId, action: 'process.award_task.complete', outcome }))
  }
}
