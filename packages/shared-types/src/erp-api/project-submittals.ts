import { z } from 'zod'

const projectSubmittalStatusSchema = z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected'])
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((value) => {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === (month ?? 0) - 1 && parsed.getUTCDate() === day
}, 'Use a real calendar date.')
const text = (max: number, required = false) => {
  const base = z.string().trim().max(max)
  return required ? base.min(1) : base.default('')
}

export const projectSubmittalListQuerySchema = z.object({
  status: projectSubmittalStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict()

export const createProjectSubmittalCommandSchema = z.object({
  projectId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  title: text(200, true),
  description: text(10000, true),
  specSection: text(120),
  discipline: text(120),
  planReference: text(200),
  dueDate: calendarDateSchema.nullable(),
  assignedTo: z.string().uuid().nullable(),
}).strict()

export const updateProjectSubmittalCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: text(200, true),
  description: text(10000, true),
  specSection: text(120),
  discipline: text(120),
  planReference: text(200),
  dueDate: calendarDateSchema.nullable(),
  assignedTo: z.string().uuid().nullable(),
}).strict()

export const projectSubmittalSubmitCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  submissionNotes: text(10000),
}).strict()

export const projectSubmittalReviewStartCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
}).strict()

export const projectSubmittalDecisionCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  decision: z.enum(['approve', 'reject']),
  reviewNotes: text(10000),
  rejectionReason: text(5000),
}).strict().superRefine((value, context) => {
  if (value.decision === 'reject' && !value.rejectionReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rejectionReason'], message: 'A rejection reason is required.' })
  }
})

export const projectSubmittalRowSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  submittalNumber: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
  specSection: z.string().max(120),
  discipline: z.string().max(120),
  planReference: z.string().max(200),
  dueDate: calendarDateSchema.nullable(),
  status: projectSubmittalStatusSchema,
  submissionNotes: z.string().max(10000),
  reviewNotes: z.string().max(10000),
  rejectionReason: z.string().max(5000),
  requestedBy: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
  submittedAt: z.string().datetime({ offset: true }).nullable(),
  submittedBy: z.string().uuid().nullable(),
  reviewStartedAt: z.string().datetime({ offset: true }).nullable(),
  reviewStartedBy: z.string().uuid().nullable(),
  reviewedAt: z.string().datetime({ offset: true }).nullable(),
  reviewedBy: z.string().uuid().nullable(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict()

export const projectSubmittalListResultSchema = z.object({
  projectId: z.string().uuid(),
  rows: z.array(projectSubmittalRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().positive(),
}).strict()

export const projectSubmittalCreateResultSchema = z.object({
  projectId: z.string().uuid(),
  created: z.boolean(),
  changed: z.boolean(),
  submittal: projectSubmittalRowSchema,
}).strict()

export const projectSubmittalMutationResultSchema = z.object({
  projectId: z.string().uuid(),
  changed: z.boolean(),
  submittal: projectSubmittalRowSchema,
}).strict()

export type ProjectSubmittalStatus = z.infer<typeof projectSubmittalStatusSchema>
export type ProjectSubmittalListQuery = z.infer<typeof projectSubmittalListQuerySchema>
export type CreateProjectSubmittalCommand = z.infer<typeof createProjectSubmittalCommandSchema>
export type UpdateProjectSubmittalCommand = z.infer<typeof updateProjectSubmittalCommandSchema>
export type ProjectSubmittalSubmitCommand = z.infer<typeof projectSubmittalSubmitCommandSchema>
export type ProjectSubmittalReviewStartCommand = z.infer<typeof projectSubmittalReviewStartCommandSchema>
export type ProjectSubmittalDecisionCommand = z.infer<typeof projectSubmittalDecisionCommandSchema>
export type ProjectSubmittalRow = z.infer<typeof projectSubmittalRowSchema>
export type ProjectSubmittalListResult = z.infer<typeof projectSubmittalListResultSchema>
export type ProjectSubmittalCreateResult = z.infer<typeof projectSubmittalCreateResultSchema>
export type ProjectSubmittalMutationResult = z.infer<typeof projectSubmittalMutationResultSchema>
