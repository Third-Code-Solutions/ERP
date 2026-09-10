import { z } from 'zod'

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0))
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === (month ?? 0) - 1 &&
      parsed.getUTCDate() === day
    )
  }, 'Use a real calendar date.')

const percentSchema = z.number().finite().min(0).max(100)
const notesSchema = z.string().trim().max(5000).default('')

export const projectWeeklyProgressStatusSchema = z.enum(['open', 'locked'])

export const projectWeeklyProgressPercentSchema = z
  .object({
    civil_pct: percentSchema,
    electrical_pct: percentSchema,
    mep_pct: percentSchema,
    finishes_pct: percentSchema,
    overall_pct: percentSchema,
  })
  .strict()

export const projectWeeklyProgressListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict()

export const createProjectWeeklyProgressCommandSchema = z.object({
  projectId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  weekEnding: calendarDateSchema,
  percentByCategory: projectWeeklyProgressPercentSchema,
  notes: notesSchema,
}).strict()

export const lockProjectWeeklyProgressCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  lockReason: notesSchema,
}).strict()

export const projectWeeklyProgressWarSnapshotSchema = z
  .object({
    weekEnding: calendarDateSchema,
    overallPct: percentSchema,
    percentByCategory: projectWeeklyProgressPercentSchema,
    notes: z.string().max(5000),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const projectWeeklyProgressRowSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    progressUpdateId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
    weekEnding: calendarDateSchema,
    cutoffAt: z.string().datetime({ offset: true }),
    status: projectWeeklyProgressStatusSchema,
    percentByCategory: projectWeeklyProgressPercentSchema,
    notes: z.string().max(5000),
    warSnapshot: projectWeeklyProgressWarSnapshotSchema.nullable(),
    lockedAt: z.string().datetime({ offset: true }).nullable(),
    lockedBy: z.string().uuid().nullable(),
    lockReason: z.string().max(5000),
    version: z.number().int().min(1),
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const projectWeeklyProgressListResultSchema = z.object({
  projectId: z.string().uuid(),
  rows: z.array(projectWeeklyProgressRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().positive(),
}).strict()

export const projectWeeklyProgressMutationResultSchema = z.object({
  projectId: z.string().uuid(),
  created: z.boolean(),
  changed: z.boolean(),
  row: projectWeeklyProgressRowSchema,
}).strict()

export const projectWeeklyProgressLockResultSchema = z.object({
  projectId: z.string().uuid(),
  changed: z.boolean(),
  row: projectWeeklyProgressRowSchema,
}).strict()

export type ProjectWeeklyProgressStatus = z.infer<typeof projectWeeklyProgressStatusSchema>
export type ProjectWeeklyProgressPercent = z.infer<typeof projectWeeklyProgressPercentSchema>
export type ProjectWeeklyProgressListQuery = z.infer<typeof projectWeeklyProgressListQuerySchema>
export type CreateProjectWeeklyProgressCommand = z.infer<typeof createProjectWeeklyProgressCommandSchema>
export type LockProjectWeeklyProgressCommand = z.infer<typeof lockProjectWeeklyProgressCommandSchema>
export type ProjectWeeklyProgressWarSnapshot = z.infer<typeof projectWeeklyProgressWarSnapshotSchema>
export type ProjectWeeklyProgressRow = z.infer<typeof projectWeeklyProgressRowSchema>
export type ProjectWeeklyProgressListResult = z.infer<typeof projectWeeklyProgressListResultSchema>
export type ProjectWeeklyProgressMutationResult = z.infer<typeof projectWeeklyProgressMutationResultSchema>
export type ProjectWeeklyProgressLockResult = z.infer<typeof projectWeeklyProgressLockResultSchema>

/**
 * Weekly reports use Sunday as the period boundary (the existing progress
 * form's default). The Thursday after that boundary at 17:00 Philippine time
 * is the deterministic WAR cut-off. Keep this policy in one shared function
 * so UI previews and Core enforcement cannot drift.
 */
export function weeklyProgressCutoffAt(weekEnding: string): string {
  const [year, month, day] = weekEnding.split('-').map(Number)
  const ending = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0))
  const dayOfWeek = ending.getUTCDay()
  const daysUntilNextThursday = ((4 - dayOfWeek + 7) % 7) || 7
  const cutoff = new Date(
    Date.UTC(
      ending.getUTCFullYear(),
      ending.getUTCMonth(),
      ending.getUTCDate() + daysUntilNextThursday,
      9,
      0,
      0,
      0,
    ),
  )
  return cutoff.toISOString()
}
