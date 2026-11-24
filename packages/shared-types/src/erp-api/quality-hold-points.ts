import { z } from 'zod'
import { isoDateTimeString } from '../iso-datetime'

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
  dueDate: isoDateTimeString({ offset: true }).nullable().default(null),
  assignedToUserId: z.string().guid().nullable().default(null),
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
  projectId: z.string().guid(),
  clientRequestId: z.string().guid(),
  title: qualityText(200, true),
  description: qualityText(10000, true),
  discipline: qualityText(120),
  location: qualityText(200),
  planReference: qualityText(200),
  holdPoint: z.boolean(),
  inspectionDate: nullableDate,
  assignedTo: z.string().guid().nullable(),
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
  assignedTo: z.string().guid().nullable(),
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
  clientRequestId: z.string().guid(),
  planDocumentId: z.string().guid().nullable().default(null),
  items: z.array(qualityHoldPointPunchlistItemCommandSchema).min(1).max(100),
}).strict()

export const qualityHoldPointRowSchema = z.object({
  id: z.string().guid(),
  projectId: z.string().guid(),
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
  requestedBy: z.string().guid(),
  assignedTo: z.string().guid().nullable(),
  submittedAt: isoDateTimeString({ offset: true }).nullable(),
  submittedBy: z.string().guid().nullable(),
  acceptedAt: isoDateTimeString({ offset: true }).nullable(),
  acceptedBy: z.string().guid().nullable(),
  rejectedAt: isoDateTimeString({ offset: true }).nullable(),
  rejectedBy: z.string().guid().nullable(),
  punchlistHandoffAt: isoDateTimeString({ offset: true }).nullable(),
  punchlistHandoffBy: z.string().guid().nullable(),
  version: z.number().int().min(1),
  createdAt: isoDateTimeString({ offset: true }),
  updatedAt: isoDateTimeString({ offset: true }),
}).strict()

export const qualityHoldPointListResultSchema = z.object({
  projectId: z.string().guid(),
  rows: z.array(qualityHoldPointRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().positive(),
}).strict()

export const qualityHoldPointCreateResultSchema = z.object({
  projectId: z.string().guid(),
  created: z.boolean(),
  changed: z.boolean(),
  entry: qualityHoldPointRowSchema,
}).strict()

export const qualityHoldPointMutationResultSchema = z.object({
  projectId: z.string().guid(),
  changed: z.boolean(),
  entry: qualityHoldPointRowSchema,
}).strict()

export const qualityHoldPointPunchlistSourceSchema = z.object({
  qualityHoldPointId: z.string().guid(),
  iwrNumber: z.string().trim().min(1).max(40),
  findings: z.string().max(10000),
  rejectionReason: z.string().trim().min(1).max(5000),
  planDocumentId: z.string().guid().nullable(),
}).strict()

export const qualityHoldPointPunchlistItemRowSchema = z.object({
  id: z.string().guid(),
  projectId: z.string().guid(),
  description: z.string().trim().min(1).max(10000),
  location: z.string().max(255).nullable(),
  trade: z.string().max(120).nullable(),
  priority: punchlistPrioritySchema,
  status: punchlistStatusSchema,
  dueDate: isoDateTimeString({ offset: true }).nullable(),
  assignedToUserId: z.string().guid().nullable(),
  assignedToText: z.string().max(255).nullable(),
  createdAt: isoDateTimeString({ offset: true }),
  createdBy: z.string().guid().nullable(),
  sourceHandoffId: z.string().guid(),
}).strict()

export const qualityHoldPointPunchlistHandoffResultSchema = z.object({
  clientRequestId: z.string().guid(),
  projectId: z.string().guid(),
  qualityHoldPointId: z.string().guid(),
  handoffId: z.string().guid(),
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
