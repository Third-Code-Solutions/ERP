'use server'

/**
 * Server actions for the Tasks surface (REFACTOR.md M5 US-Con-001).
 *
 * - completeTask: delegates one tenant-selected authenticated command to Core,
 *                 which owns the task, audit, SLA, and replay transaction.
 * - createTask: creates one manually assigned task inside the caller's tenant.
 * - triggerDailyGeneration: runs today's cadence generation for the caller's
 *                 tenant and reports what it created. Restricted to admin/owner.
 */

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { dailyTasks, projects, users } from '@third-code-erp/database/schema'
import {
  dailyTaskCompletionCommandSchema,
  dailyTaskCompletionResultSchema,
  type DailyTaskCompletionCommand,
} from '@third-code-erp/shared-types'
import { z } from 'zod'
// Kept as its own import line: the daily-task contract test anchors on it.
import { writeAuditLog } from '@/lib/audit'
import { stampActorInTransaction, writeAuditLogInTransaction } from '@/lib/audit'
import {
  completeDailyTaskThroughCoreApi,
  dailyTaskCompletionWritesUseCoreApi,
} from '@/lib/erp-core-client'
import {
  CLOSED_PROJECT_STATUSES,
  DEFAULT_CADENCE_TEMPLATES,
  generateTasksForDate,
  manilaCalendarDate,
  parseManilaDateTimeLocal,
} from '@/lib/operations/cadence-engine'
import { roleLabel } from '@/lib/operations/nav-config'

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
    taskId: z.string().guid(),
    projectId: z.string().guid(),
    assigneeId: z.string().guid().nullable(),
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

const createTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Enter a task title.')
      .max(255, 'Keep the title under 255 characters.'),
    description: z
      .string()
      .trim()
      .max(2_000, 'Keep the description under 2,000 characters.')
      .optional(),
    project_id: z.string().guid('Choose a project.'),
    assignee_id: z.string().guid('Choose who the task is assigned to.'),
    // datetime-local value, read as Manila wall-clock time.
    due_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a due date and time.'),
  })
  .strict()

const DAY_MS = 86_400_000
const DUE_MAX_PAST_MS = 30 * DAY_MS
const DUE_MAX_AHEAD_MS = 365 * DAY_MS

function isOwnerOrAdmin(role: string): boolean {
  return role === 'owner' || role === 'admin'
}

export async function createTask(formData: FormData): Promise<ActionResult> {
  const fields = new Map<string, FormDataEntryValue>()
  for (const [key, value] of formData.entries()) {
    if (fields.has(key)) return { error: 'Invalid task request.' }
    fields.set(key, value)
  }
  const parsed = createTaskSchema.safeParse(Object.fromEntries(fields))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    // Field messages are written for people; extra keys only come from tampered requests.
    return { error: issue && issue.code !== 'unrecognized_keys' ? issue.message : 'Invalid task request.' }
  }
  const input = parsed.data
  const dueDate = parseManilaDateTimeLocal(input.due_at)
  if (!dueDate) return { error: 'Enter a due date and time.' }
  const nowMs = Date.now()
  if (dueDate.getTime() < nowMs - DUE_MAX_PAST_MS || dueDate.getTime() > nowMs + DUE_MAX_AHEAD_MS) {
    return { error: 'Choose a due date within the past 30 days or the next year.' }
  }

  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }
  const actorRole = profile.role
  if (!can(actorRole, 'sd.daily_tasks')) return { error: 'Forbidden' }

  const traceId = randomUUID()
  try {
    const [project] = await db
      .select({ id: projects.id, status: projects.status })
      .from(projects)
      .where(and(eq(projects.id, input.project_id), eq(projects.tenant_id, profile.tenantId)))
      .limit(1)
    if (!project) return { error: 'Project not found.' }
    if (CLOSED_PROJECT_STATUSES.has(project.status)) {
      return { error: 'Tasks cannot be added to a completed or cancelled project.' }
    }

    const [assignee] = await db
      .select({ id: users.id, role: users.role, status: users.account_status })
      .from(users)
      .where(and(eq(users.id, input.assignee_id), eq(users.tenant_id, profile.tenantId)))
      .limit(1)
    // Assignees must be able to complete the task under the sd.daily_tasks policy.
    if (!assignee || assignee.status !== 'active' || !can(assignee.role, 'sd.daily_tasks')) {
      return { error: 'Choose an active teammate who can complete tasks.' }
    }
    // No upward assignment: only owners and admins may put work in an owner's or admin's queue.
    if (isOwnerOrAdmin(assignee.role) && !isOwnerOrAdmin(actorRole)) {
      return { error: 'Only an owner or admin can assign tasks to an owner or admin.' }
    }

    const description = input.description ? input.description : null
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [row] = await tx
        .insert(dailyTasks)
        .values({
          tenant_id: profile.tenantId,
          project_id: project.id,
          assignee_id: assignee.id,
          title: input.title,
          description,
          role: null,
          due_date: dueDate,
          status: 'pending',
        })
        .returning({ id: dailyTasks.id })
      if (!row) throw new Error('Task insert returned no row')
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'daily_task',
        entityId: row.id,
        action: 'create',
        diff: {
          title: input.title,
          project_id: project.id,
          assignee_id: assignee.id,
          due_date: dueDate.toISOString(),
          source: 'manual',
        },
      })
    })
  } catch {
    // Redacted like completeTask: identifiers and outcome only, never task text or SQL.
    console.warn('[daily-task-create]', {
      trace_id: traceId,
      tenant_id: profile.tenantId,
      actor_id: profile.user.id,
      action: 'daily_task.create',
      outcome: 'exception',
    })
    return { error: 'The task could not be created. Please try again.' }
  }

  revalidatePath('/tasks')
  return { ok: true, message: 'Task created.' }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export async function triggerDailyGeneration(): Promise<ActionResult> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }

  if (profile.role !== 'admin' && profile.role !== 'owner') {
    return { error: 'Forbidden' }
  }

  let result: Awaited<ReturnType<typeof generateTasksForDate>>
  try {
    result = await generateTasksForDate(profile.tenantId, manilaCalendarDate(new Date()))
  } catch (err) {
    console.warn('[triggerDailyGeneration] generation failed:', err)
    return { error: 'Task generation failed. Please try again.' }
  }

  try {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'cadence',
      entityId: profile.tenantId,
      action: 'create',
      diff: { event: 'cadence.generate', ...result },
    })
  } catch {
    // The rows are committed and each insert is audited by its DB trigger; only
    // the run summary is missing, so still report the generation as it happened.
    console.warn('[triggerDailyGeneration] run summary audit failed', {
      tenant_id: profile.tenantId,
      actor_id: profile.user.id,
    })
  }

  revalidatePath('/tasks')

  const { created, skipped, projectsConsidered } = result
  const projectsText = plural(projectsConsidered, 'active project')
  let message: string
  if (projectsConsidered === 0) {
    message = 'There are no active projects, so no cadence tasks were generated.'
  } else if (created === 0 && skipped === 0) {
    const cadenceRoles = DEFAULT_CADENCE_TEMPLATES.map((template) => roleLabel(template.role)).join(', ')
    message = `No active teammates hold a cadence role (${cadenceRoles}), so no tasks were generated.`
  } else if (created === 0) {
    message = `Today’s cadence is already generated: ${plural(skipped, 'task')} across ${projectsText}. Nothing new was added.`
  } else {
    message = `Generated ${plural(created, 'task')} across ${projectsText}.${skipped > 0 ? ` ${skipped} already existed.` : ''}`
  }
  return { ok: true, message }
}
