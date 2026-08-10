import { z } from 'zod'

/** Server-authorized project discussion entry. */
export const createProjectCommentCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict()

export const projectCommentCreationResultSchema = z
  .object({
    commentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    authorId: z.string().uuid(),
    body: z.string().trim().min(1).max(10_000),
    mentions: z.array(z.string().uuid()),
    created: z.literal(true),
  })
  .strict()

export type CreateProjectCommentCommand = z.infer<
  typeof createProjectCommentCommandSchema
>
export type ProjectCommentCreationResult = z.infer<
  typeof projectCommentCreationResultSchema
>

/** Server-authorized project discussion deletion. */
export const deleteProjectCommentCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    commentId: z.string().uuid(),
  })
  .strict()

export const projectCommentDeletionResultSchema = z
  .object({
    commentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    deleted: z.literal(true),
  })
  .strict()

export type DeleteProjectCommentCommand = z.infer<
  typeof deleteProjectCommentCommandSchema
>
export type ProjectCommentDeletionResult = z.infer<
  typeof projectCommentDeletionResultSchema
>

/** Bounded, tenant-scoped project discussion read. */
export const projectCommentListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict()

export const projectCommentListItemSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    authorId: z.string().uuid().nullable(),
    authorName: z.string().nullable(),
    authorEmail: z.string().email().nullable(),
    body: z.string().min(1).max(10_000),
    mentions: z.array(z.string().uuid()),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const projectCommentListResultSchema = z
  .object({
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    limit: z.number().int().min(1).max(100),
    hasMore: z.boolean(),
    items: z.array(projectCommentListItemSchema).max(100),
  })
  .strict()

export type ProjectCommentListQuery = z.infer<
  typeof projectCommentListQuerySchema
>
export type ProjectCommentListItem = z.infer<
  typeof projectCommentListItemSchema
>
export type ProjectCommentListResult = z.infer<
  typeof projectCommentListResultSchema
>
