import { z } from 'zod'

const qualityHoldPointStatusSchema = z.enum([
  'planned',
  'ready',
  'submitted',
  'accepted',
  'rejected',
])

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

const qualityText = (max: number, required = false) => {
  const base = z.string().trim().max(max)
  return required ? base.min(1) : base.default('')
}

const nullableDate = calendarDateSchema.nullable()

const punchlistPrioritySchema = z.enum(['low', 'medium', 'high', 'critical'])
const punchlistStatusSchema = z.enum(['open', 'in_progress', 'for_inspection', 'closed'])

const qualityHoldPointPunchlistItemCommandSchema = z.object({
  description: z.string().trim().min(3).max(10000),
  location: z.string().trim().max(255).nullable().default(null),
  trade: z.string().trim().max(120).nullable().default(null),
  priority: punchlistPrioritySchema.default('medium'),
  dueDate: z.string().datetime({ offset: true }).nullable().default(null),
  assignedToUserId: z.string().uuid().nullable().default(null),
  assignedToText: z.string().trim().max(255).nullable().default(null),
}).strict()

export const qualityHoldPointListQuerySchema = z.object({
  status: qualityHoldPointStatusSchema.optional(),
  holdPoint: z
    .union([
      z.boolean(),
      z.enum(['true', 'false']).transform((value) => value === 'true'),
    ])
    .optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict()

export const createQualityHoldPointCommandSchema = z.object({
  projectId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  title: qualityText(200, true),
  description: qualityText(10000, true),
  discipline: qualityText(120),
  location: qualityText(200),
  planReference: qualityText(200),
  holdPoint: z.boolean(),
  inspectionDate: nullableDate,
  assignedTo: z.string().uuid().nullable(),
}).strict()

export const updateQualityHoldPointCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: qualityText(200, true),
  description: qualityText(10000, true),
  discipline: qualityText(120),
  location: qualityText(200),
  planReference: qualityText(200),
  holdPoint: z.boolean(),
  inspectionDate: nullableDate,
  assignedTo: z.string().uuid().nullable(),
}).strict()

export const qualityHoldPointReadyCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
}).strict()

export const qualityHoldPointSubmitCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  requestNotes: qualityText(10000),
}).strict()

export const qualityHoldPointAcceptCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  findings: qualityText(10000),
  acceptanceNotes: qualityText(10000),
}).strict()

export const qualityHoldPointRejectCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  findings: qualityText(10000),
  reason: qualityText(5000, true),
}).strict()

/** Creates one immutable handoff and one or more linked punchlist items. */
export const qualityHoldPointPunchlistHandoffCommandSchema = z.object({
  clientRequestId: z.string().uuid(),
  planDocumentId: z.string().uuid().nullable().default(null),
  items: z.array(qualityHoldPointPunchlistItemCommandSchema).min(1).max(100),
}).strict()

export const qualityHoldPointRowSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  iwrNumber: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(10000),
  discipline: z.string().max(120),
  location: z.string().max(200),
  planReference: z.string().max(200),
  holdPoint: z.boolean(),
  inspectionDate: calendarDateSchema.nullable(),
  status: qualityHoldPointStatusSchema,
  requestNotes: z.string().max(10000),
  findings: z.string().max(10000),
  rejectionReason: z.string().max(5000),
  acceptanceNotes: z.string().max(10000),
  requestedBy: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
  submittedAt: z.string().datetime({ offset: true }).nullable(),
  submittedBy: z.string().uuid().nullable(),
  acceptedAt: z.string().datetime({ offset: true }).nullable(),
  acceptedBy: z.string().uuid().nullable(),
  rejectedAt: z.string().datetime({ offset: true }).nullable(),
  rejectedBy: z.string().uuid().nullable(),
  punchlistHandoffAt: z.string().datetime({ offset: true }).nullable(),
  punchlistHandoffBy: z.string().uuid().nullable(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict()

export const qualityHoldPointListResultSchema = z.object({
  projectId: z.string().uuid(),
  rows: z.array(qualityHoldPointRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().positive(),
}).strict()

export const qualityHoldPointCreateResultSchema = z.object({
  projectId: z.string().uuid(),
  created: z.boolean(),
  changed: z.boolean(),
  entry: qualityHoldPointRowSchema,
}).strict()

export const qualityHoldPointMutationResultSchema = z.object({
  projectId: z.string().uuid(),
  changed: z.boolean(),
  entry: qualityHoldPointRowSchema,
}).strict()

export const qualityHoldPointPunchlistSourceSchema = z.object({
  qualityHoldPointId: z.string().uuid(),
  iwrNumber: z.string().trim().min(1).max(40),
  findings: z.string().max(10000),
  rejectionReason: z.string().trim().min(1).max(5000),
  planDocumentId: z.string().uuid().nullable(),
}).strict()

export const qualityHoldPointPunchlistItemRowSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  description: z.string().trim().min(1).max(10000),
  location: z.string().max(255).nullable(),
  trade: z.string().max(120).nullable(),
  priority: punchlistPrioritySchema,
  status: punchlistStatusSchema,
  dueDate: z.string().datetime({ offset: true }).nullable(),
  assignedToUserId: z.string().uuid().nullable(),
  assignedToText: z.string().max(255).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().uuid().nullable(),
  sourceHandoffId: z.string().uuid(),
}).strict()

export const qualityHoldPointPunchlistHandoffResultSchema = z.object({
  projectId: z.string().uuid(),
  qualityHoldPointId: z.string().uuid(),
  handoffId: z.string().uuid(),
  created: z.boolean(),
  changed: z.boolean(),
  source: qualityHoldPointPunchlistSourceSchema,
  items: z.array(qualityHoldPointPunchlistItemRowSchema).min(1),
}).strict()

export type QualityHoldPointStatus = z.infer<typeof qualityHoldPointStatusSchema>
export type QualityHoldPointListQuery = z.infer<typeof qualityHoldPointListQuerySchema>
export type CreateQualityHoldPointCommand = z.infer<typeof createQualityHoldPointCommandSchema>
export type UpdateQualityHoldPointCommand = z.infer<typeof updateQualityHoldPointCommandSchema>
export type QualityHoldPointReadyCommand = z.infer<typeof qualityHoldPointReadyCommandSchema>
export type QualityHoldPointSubmitCommand = z.infer<typeof qualityHoldPointSubmitCommandSchema>
export type QualityHoldPointAcceptCommand = z.infer<typeof qualityHoldPointAcceptCommandSchema>
export type QualityHoldPointRejectCommand = z.infer<typeof qualityHoldPointRejectCommandSchema>
export type QualityHoldPointPunchlistItemCommand = z.infer<typeof qualityHoldPointPunchlistItemCommandSchema>
export type QualityHoldPointPunchlistHandoffCommand = z.infer<typeof qualityHoldPointPunchlistHandoffCommandSchema>
export type QualityHoldPointRow = z.infer<typeof qualityHoldPointRowSchema>
export type QualityHoldPointListResult = z.infer<typeof qualityHoldPointListResultSchema>
export type QualityHoldPointCreateResult = z.infer<typeof qualityHoldPointCreateResultSchema>
export type QualityHoldPointMutationResult = z.infer<typeof qualityHoldPointMutationResultSchema>
export type QualityHoldPointPunchlistSource = z.infer<typeof qualityHoldPointPunchlistSourceSchema>
export type QualityHoldPointPunchlistItemRow = z.infer<typeof qualityHoldPointPunchlistItemRowSchema>
export type QualityHoldPointPunchlistHandoffResult = z.infer<typeof qualityHoldPointPunchlistHandoffResultSchema>
