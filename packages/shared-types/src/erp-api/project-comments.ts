import { z } from 'zod'

/** Server-authorized project discussion entry. */
export const createProjectCommentCommandSchema = z
  .object({
    projectId: z.string().guid(),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict()

export const projectCommentCreationResultSchema = z
  .object({
    commentId: z.string().guid(),
    tenantId: z.string().guid(),
    projectId: z.string().guid(),
    authorId: z.string().guid(),
    body: z.string().trim().min(1).max(10_000),
    mentions: z.array(z.string().guid()),
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
    projectId: z.string().guid(),
    commentId: z.string().guid(),
  })
  .strict()

export const projectCommentDeletionResultSchema = z
  .object({
    commentId: z.string().guid(),
    tenantId: z.string().guid(),
    projectId: z.string().guid(),
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
    id: z.string().guid(),
    tenantId: z.string().guid(),
    projectId: z.string().guid(),
    authorId: z.string().guid().nullable(),
    authorName: z.string().nullable(),
    authorEmail: z.string().email().nullable(),
    body: z.string().min(1).max(10_000),
    mentions: z.array(z.string().guid()),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const projectCommentListResultSchema = z
  .object({
    tenantId: z.string().guid(),
    projectId: z.string().guid(),
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
