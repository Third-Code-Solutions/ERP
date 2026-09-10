import { z } from 'zod'

const projectRfiStatusSchema = z.enum(['open', 'answered', 'closed'])
const projectRfiPrioritySchema = z.enum(['low', 'normal', 'high', 'critical'])
const isoDateTime = z.string().datetime({ offset: true })

export const projectRfiListQuerySchema = z
  .object({
    status: projectRfiStatusSchema.optional(),
    priority: projectRfiPrioritySchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()

export const createProjectRfiCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    clientRequestId: z.string().uuid(),
    subject: z.string().trim().min(1).max(200),
    question: z.string().trim().min(1).max(10000),
    priority: projectRfiPrioritySchema,
    assignedTo: z.string().uuid().nullable(),
    dueAt: isoDateTime.nullable(),
  })
  .strict()

export const projectRfiAnswerCommandSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    response: z.string().trim().min(1).max(10000),
  })
  .strict()

export const projectRfiCloseCommandSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict()

export const projectRfiReopenCommandSchema = projectRfiCloseCommandSchema

export const projectRfiRowSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    rfiNumber: z.string().trim().min(1).max(40),
    subject: z.string().trim().min(1).max(200),
    question: z.string().trim().min(1).max(10000),
    priority: projectRfiPrioritySchema,
    status: projectRfiStatusSchema,
    requestedBy: z.string().uuid(),
    assignedTo: z.string().uuid().nullable(),
    dueAt: isoDateTime.nullable(),
    response: z.string().trim().min(1).max(10000).nullable(),
    respondedAt: isoDateTime.nullable(),
    respondedBy: z.string().uuid().nullable(),
    closedAt: isoDateTime.nullable(),
    closedBy: z.string().uuid().nullable(),
    version: z.number().int().min(1),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .strict()

export const projectRfiListResultSchema = z
  .object({
    projectId: z.string().uuid(),
    rows: z.array(projectRfiRowSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().min(1).max(100),
    totalPages: z.number().int().positive(),
  })
  .strict()

export const projectRfiCreateResultSchema = z
  .object({
    projectId: z.string().uuid(),
    created: z.boolean(),
    rfi: projectRfiRowSchema,
  })
  .strict()

export const projectRfiTransitionResultSchema = z
  .object({
    projectId: z.string().uuid(),
    changed: z.boolean(),
    rfi: projectRfiRowSchema,
  })
  .strict()

export type ProjectRfiStatus = z.infer<typeof projectRfiStatusSchema>
export type ProjectRfiPriority = z.infer<typeof projectRfiPrioritySchema>
export type ProjectRfiListQuery = z.infer<typeof projectRfiListQuerySchema>
export type CreateProjectRfiCommand = z.infer<typeof createProjectRfiCommandSchema>
export type ProjectRfiAnswerCommand = z.infer<typeof projectRfiAnswerCommandSchema>
export type ProjectRfiCloseCommand = z.infer<typeof projectRfiCloseCommandSchema>
export type ProjectRfiReopenCommand = z.infer<typeof projectRfiReopenCommandSchema>
export type ProjectRfiRow = z.infer<typeof projectRfiRowSchema>
export type ProjectRfiListResult = z.infer<typeof projectRfiListResultSchema>
export type ProjectRfiCreateResult = z.infer<typeof projectRfiCreateResultSchema>
export type ProjectRfiTransitionResult = z.infer<typeof projectRfiTransitionResultSchema>
