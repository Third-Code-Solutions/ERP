import { z } from 'zod'

/** DELETE /v1/documents/:documentId has no mutable body. */
export const documentDeleteBodySchema = z.object({}).strict()

export const documentDeleteCommandSchema = z
  .object({
    documentId: z.string().uuid(),
  })
  .strict()

export const documentDeleteResultSchema = z
  .object({
    documentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    storagePath: z.string().trim().min(1).max(2_000),
    status: z.literal('deleted'),
    derivedScopeItemsRemoved: z.number().int().min(0).max(5_000),
  })
  .strict()

export type DocumentDeleteBody = z.infer<typeof documentDeleteBodySchema>
export type DocumentDeleteCommand = z.infer<
  typeof documentDeleteCommandSchema
>
export type DocumentDeleteResult = z.infer<typeof documentDeleteResultSchema>
