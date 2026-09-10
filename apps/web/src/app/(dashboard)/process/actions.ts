'use server'

import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  updateTaskStatusCommandSchema,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import { updateProcessTaskStatusThroughCoreApi } from '@/lib/erp-core-client'

export interface ProcessTaskStatusActionResult {
  ok: boolean
  error?: string
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
