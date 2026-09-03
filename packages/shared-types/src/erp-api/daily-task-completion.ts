import { z } from 'zod'

const normalizedOptionalNotesSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0
      ? undefined
      : value,
  z.string().trim().min(1).max(2000).optional()
)

/** Strict browser-to-Core command. Identity and workflow state come from trusted context. */
export const dailyTaskCompletionCommandSchema = z
  .object({
    notes: normalizedOptionalNotesSchema,
  })
  .strict()

/** Canonical persisted completion returned by Core for first success and replay. */
export const dailyTaskCompletionResultSchema = z
  .object({
    ok: z.literal(true),
    taskId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    assigneeId: z.string().uuid().nullable(),
    status: z.literal('done'),
    completionNotes: z.string().max(2000).nullable(),
    completedAt: z.string().datetime({ offset: true }),
    completedBy: z.string().uuid(),
  })
  .strict()

export type DailyTaskCompletionCommand = z.infer<
  typeof dailyTaskCompletionCommandSchema
>
export type DailyTaskCompletionResult = z.infer<
  typeof dailyTaskCompletionResultSchema
>
