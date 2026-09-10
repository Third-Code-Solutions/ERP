import { z } from 'zod'

const siteDiaryStatusSchema = z.enum(['draft', 'submitted'])

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

const diaryText = (max: number) => z.string().trim().max(max).default('')

export const siteDiaryListQuerySchema = z
  .object({
    status: siteDiaryStatusSchema.optional(),
    fromDate: calendarDateSchema.optional(),
    toDate: calendarDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(
    (value) => !value.fromDate || !value.toDate || value.fromDate <= value.toDate,
    { message: 'fromDate must be on or before toDate.', path: ['fromDate'] },
  )

export const createSiteDiaryCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
    diaryDate: calendarDateSchema,
    weather: z.string().trim().max(160).default(''),
    manpowerCount: z.number().int().min(0).max(100000),
    workCompleted: diaryText(20000),
    constraints: diaryText(20000),
    safetyNotes: diaryText(20000),
  })
  .strict()

export const updateSiteDiaryCommandSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    weather: z.string().trim().max(160).default(''),
    manpowerCount: z.number().int().min(0).max(100000),
    workCompleted: diaryText(20000),
    constraints: diaryText(20000),
    safetyNotes: diaryText(20000),
  })
  .strict()

export const submitSiteDiaryCommandSchema = z
  .object({ expectedVersion: z.number().int().min(1) })
  .strict()

export const siteDiaryRowSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    diaryDate: calendarDateSchema,
    status: siteDiaryStatusSchema,
    weather: z.string().max(160),
    manpowerCount: z.number().int().nonnegative(),
    workCompleted: z.string().max(20000),
    constraints: z.string().max(20000),
    safetyNotes: z.string().max(20000),
    createdBy: z.string().uuid(),
    submittedAt: z.string().datetime({ offset: true }).nullable(),
    submittedBy: z.string().uuid().nullable(),
    version: z.number().int().min(1),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const siteDiaryListResultSchema = z
  .object({
    projectId: z.string().uuid(),
    rows: z.array(siteDiaryRowSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().min(1).max(100),
    totalPages: z.number().int().positive(),
  })
  .strict()

export const siteDiaryMutationResultSchema = z
  .object({
    projectId: z.string().uuid(),
    changed: z.boolean(),
    entry: siteDiaryRowSchema,
  })
  .strict()

export const siteDiaryCreateResultSchema = siteDiaryMutationResultSchema.extend({
  created: z.boolean(),
})

export type SiteDiaryStatus = z.infer<typeof siteDiaryStatusSchema>
export type SiteDiaryListQuery = z.infer<typeof siteDiaryListQuerySchema>
export type CreateSiteDiaryCommand = z.infer<typeof createSiteDiaryCommandSchema>
export type UpdateSiteDiaryCommand = z.infer<typeof updateSiteDiaryCommandSchema>
export type SubmitSiteDiaryCommand = z.infer<typeof submitSiteDiaryCommandSchema>
export type SiteDiaryRow = z.infer<typeof siteDiaryRowSchema>
export type SiteDiaryListResult = z.infer<typeof siteDiaryListResultSchema>
export type SiteDiaryMutationResult = z.infer<typeof siteDiaryMutationResultSchema>
export type SiteDiaryCreateResult = z.infer<typeof siteDiaryCreateResultSchema>
