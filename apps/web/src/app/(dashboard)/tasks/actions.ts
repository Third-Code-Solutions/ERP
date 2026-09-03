'use server'

/**
 * Server actions for "My Tasks" surface (REFACTOR.md M5 US-Con-001).
 *
 * - completeTask: delegates one tenant-selected authenticated command to Core,
 *                 which owns the task, audit, SLA, and replay transaction.
 * - triggerDailyGeneration: emits a `cadence/generate.requested` event for
 *                 the caller's tenant. Restricted to admin/owner.
 */

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  dailyTaskCompletionCommandSchema,
  dailyTaskCompletionResultSchema,
  type DailyTaskCompletionCommand,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit'
import {
  completeDailyTaskThroughCoreApi,
  dailyTaskCompletionWritesUseCoreApi,
} from '@/lib/erp-core-client'
import { inngest } from '@/lib/inngest'

export interface ActionResult {
  error?: string
  ok?: true
  message?: string
}

export interface CompleteTaskContext {
  taskId: string
  projectId: string
  assigneeId: string | null
  requiresNotes: boolean
}

const completeTaskContextSchema = z
  .object({
    taskId: z.string().uuid(),
    projectId: z.string().uuid(),
    assigneeId: z.string().uuid().nullable(),
    requiresNotes: z.boolean(),
  })
  .strict()

type CompletionOutcome =
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'
  | 'selector_denied'
  | 'core_error'
  | 'invalid_result'
  | 'success'
  | 'exception'

function dailyTaskCompletionKey(
  taskId: string,
  command: DailyTaskCompletionCommand
): string {
  return createHash('sha256')
    .update(JSON.stringify({ command, taskId }))
    .digest('hex')
}

export async function completeTask(
  mountedContext: CompleteTaskContext,
  formData: FormData
): Promise<ActionResult> {
  const traceId = randomUUID()
  let tenantId: string | null = null
  let actorId: string | null = null

  function finish(result: ActionResult, outcome: CompletionOutcome): ActionResult {
    console.info('[daily-task-completion]', {
      trace_id: traceId,
      tenant_id: tenantId,
      actor_id: actorId,
      action: 'daily_task.complete',
      outcome,
    })
    return result
  }

  try {
    const parsedContext = completeTaskContextSchema.safeParse(mountedContext)
    const fieldNames = Array.from(formData.keys())
    const hasOnlyOneNotesField =
      fieldNames.every((field) => field === 'notes') &&
      formData.getAll('notes').length <= 1
    if (!parsedContext.success || !hasOnlyOneNotesField) {
      return finish(
        { error: 'Invalid daily task completion request.' },
        'invalid_request'
      )
    }

    const rawNotes = formData.get('notes') ?? undefined
    const parsedCommand = dailyTaskCompletionCommandSchema.safeParse({
      notes: rawNotes,
    })
    if (!parsedCommand.success) {
      return finish(
        { error: 'Invalid daily task completion request.' },
        'invalid_request'
      )
    }
    const context = parsedContext.data
    const command = parsedCommand.data
    if (context.requiresNotes && !command.notes) {
      return finish(
        { error: 'Toolbox meeting log requires notes.' },
        'invalid_request'
      )
    }

    const profile = await requireUserProfile().catch(() => null)
    if (!profile) return finish({ error: 'Unauthorized' }, 'unauthorized')
    tenantId = profile.tenantId
    actorId = profile.user.id
    if (!can(profile.role, 'sd.daily_tasks')) {
      return finish({ error: 'Forbidden' }, 'forbidden')
    }

    if (!dailyTaskCompletionWritesUseCoreApi(profile.tenantId)) {
      return finish(
        { error: 'Daily task completion is not enabled for this tenant.' },
        'selector_denied'
      )
    }

    const coreResult = await completeDailyTaskThroughCoreApi(
      context.taskId,
      command,
      dailyTaskCompletionKey(context.taskId, command)
    )
    if (!coreResult.ok || !coreResult.data) {
      return finish(
        {
          error:
            coreResult.error ??
            'Daily task was not completed. No compatibility fallback was used.',
        },
        'core_error'
      )
    }

    const parsedResult = dailyTaskCompletionResultSchema.safeParse(
      coreResult.data
    )
    if (
      !parsedResult.success ||
      parsedResult.data.taskId !== context.taskId ||
      parsedResult.data.tenantId !== profile.tenantId ||
      parsedResult.data.projectId !== context.projectId ||
      parsedResult.data.assigneeId !== context.assigneeId ||
      parsedResult.data.status !== 'done'
    ) {
      return finish(
        {
          error:
            'ERP Core API returned an invalid daily task completion result.',
        },
        'invalid_result'
      )
    }

    revalidatePath('/tasks')
    return finish(
      { ok: true, message: 'Task is complete.' },
      'success'
    )
  } catch {
    return finish(
      { error: 'Daily task completion is unavailable. Please try again.' },
      'exception'
    )
  }
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
