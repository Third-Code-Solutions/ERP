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
