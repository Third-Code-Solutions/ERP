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
  projectId: z.string().guid(),
  clientRequestId: z.string().guid(),
  weekEnding: calendarDateSchema,
  percentByCategory: projectWeeklyProgressPercentSchema,
  notes: notesSchema,
}).strict()

export const lockProjectWeeklyProgressCommandSchema = z.object({
  clientRequestId: z.string().guid().optional(),
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
    id: z.string().guid(),
    projectId: z.string().guid(),
    progressUpdateId: z.string().guid(),
    clientRequestId: z.string().guid(),
    weekEnding: calendarDateSchema,
    cutoffAt: z.string().datetime({ offset: true }),
    status: projectWeeklyProgressStatusSchema,
    percentByCategory: projectWeeklyProgressPercentSchema,
    notes: z.string().max(5000),
    warSnapshot: projectWeeklyProgressWarSnapshotSchema.nullable(),
    lockedAt: z.string().datetime({ offset: true }).nullable(),
    lockedBy: z.string().guid().nullable(),
    lockReason: z.string().max(5000),
    version: z.number().int().min(1),
    createdBy: z.string().guid(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

const commandReceiptFields = {
  schemaVersion: z.literal(1),
  tenantId: z.string().guid(),
  actorId: z.string().guid(),
  projectId: z.string().guid(),
  clientRequestId: z.string().guid(),
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  row: projectWeeklyProgressRowSchema,
}

export const projectWeeklyProgressCommandReceiptSchema = z.discriminatedUnion('operation', [
  z.object({ ...commandReceiptFields, operation: z.literal('capture'), created: z.boolean() }).strict(),
  z.object({ ...commandReceiptFields, operation: z.literal('lock'), expectedVersion: z.number().int().positive() }).strict(),
])

export const projectWeeklyProgressListResultSchema = z.object({
  projectId: z.string().guid(),
  rows: z.array(projectWeeklyProgressRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().positive(),
}).strict()

export const projectWeeklyProgressMutationResultSchema = z.object({
  receipt: projectWeeklyProgressCommandReceiptSchema.optional(),
  projectId: z.string().guid(),
  created: z.boolean(),
  changed: z.boolean(),
  row: projectWeeklyProgressRowSchema,
}).strict()

export const projectWeeklyProgressLockResultSchema = z.object({
  receipt: projectWeeklyProgressCommandReceiptSchema.optional(),
  projectId: z.string().guid(),
  changed: z.boolean(),
  row: projectWeeklyProgressRowSchema,
}).strict()

export type ProjectWeeklyProgressStatus = z.infer<typeof projectWeeklyProgressStatusSchema>
export type ProjectWeeklyProgressCommandReceipt = z.infer<typeof projectWeeklyProgressCommandReceiptSchema>
export type ProjectWeeklyProgressPercent = z.infer<typeof projectWeeklyProgressPercentSchema>
export type ProjectWeeklyProgressListQuery = z.infer<typeof projectWeeklyProgressListQuerySchema>
export type CreateProjectWeeklyProgressCommand = z.infer<typeof createProjectWeeklyProgressCommandSchema>
export type LockProjectWeeklyProgressCommand = z.infer<typeof lockProjectWeeklyProgressCommandSchema>
export type ProjectWeeklyProgressWarSnapshot = z.infer<typeof projectWeeklyProgressWarSnapshotSchema>
export type ProjectWeeklyProgressRow = z.infer<typeof projectWeeklyProgressRowSchema>
export type ProjectWeeklyProgressListResult = z.infer<typeof projectWeeklyProgressListResultSchema>
export type ProjectWeeklyProgressMutationResult = z.infer<typeof projectWeeklyProgressMutationResultSchema>
export type ProjectWeeklyProgressLockResult = z.infer<typeof projectWeeklyProgressLockResultSchema>

/** Stable semantic serialization shared by server hashing and browser validation. */
export function weeklyProgressCapturePayload(command: CreateProjectWeeklyProgressCommand): string {
  const input = createProjectWeeklyProgressCommandSchema.parse(command)
  return JSON.stringify({
    operation: 'capture',
    projectId: input.projectId.toLowerCase(),
    weekEnding: input.weekEnding,
    percentByCategory: input.percentByCategory,
    notes: input.notes,
  })
}

export function weeklyProgressLockPayload(projectId: string, periodId: string, command: LockProjectWeeklyProgressCommand): string {
  const input = lockProjectWeeklyProgressCommandSchema.parse(command)
  return JSON.stringify({
    operation: 'lock',
    projectId: z.string().guid().parse(projectId).toLowerCase(),
    periodId: z.string().guid().parse(periodId).toLowerCase(),
    expectedVersion: input.expectedVersion,
    lockReason: input.lockReason,
  })
}

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
