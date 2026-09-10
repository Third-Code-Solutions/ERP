import { z } from 'zod'

export const inspectionRfiQuerySchema = z.object({
  status: z.enum(['open', 'resolved']).optional(),
  priority: z.enum(['minor', 'major']).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict()

export const inspectionRfiTransitionCommandSchema = z.object({
  expectedResolvedAt: z.string().datetime({ offset: true }).nullable(),
  reason: z.string().trim().min(1).max(2000),
}).strict()

export const inspectionRfiRowSchema = z.object({
  id: z.string().uuid(),
  inspectionId: z.string().uuid(),
  inspectionStatus: z.enum(['draft', 'submitted', 'archived']),
  description: z.string(),
  priority: z.enum(['minor', 'major']),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  resolvedBy: z.string().uuid().nullable(),
}).strict()

export const inspectionRfiListResultSchema = z.object({
  opportunityId: z.string().uuid(),
  rows: z.array(inspectionRfiRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().positive(),
}).strict()

export const inspectionRfiTransitionResultSchema = z.object({
  opportunityId: z.string().uuid(),
  changed: z.boolean(),
  rfi: inspectionRfiRowSchema,
}).strict()

export type InspectionRfiQuery = z.infer<typeof inspectionRfiQuerySchema>
export type InspectionRfiTransitionCommand = z.infer<typeof inspectionRfiTransitionCommandSchema>
export type InspectionRfiRow = z.infer<typeof inspectionRfiRowSchema>
export type InspectionRfiListResult = z.infer<typeof inspectionRfiListResultSchema>
export type InspectionRfiTransitionResult = z.infer<typeof inspectionRfiTransitionResultSchema>
