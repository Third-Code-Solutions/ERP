import { z } from 'zod'

export const createChangeRequestCommandSchema = z
  .object({
    requestedByName: z.string().trim().min(1).max(255),
    description: z.string().trim().min(2).max(5_000),
    priority: z.enum(['minor', 'major']).default('minor'),
    affectedDesignFileId: z.string().uuid().nullable().optional(),
  })
  .strict()

export const changeRequestCreationResultSchema = z
  .object({
    changeRequestId: z.string().uuid(),
    tenantId: z.string().uuid(),
    status: z.literal('open'),
    created: z.boolean(),
  })
  .strict()

export type CreateChangeRequestCommand = z.infer<
  typeof createChangeRequestCommandSchema
>
export type ChangeRequestCreationResult = z.infer<
  typeof changeRequestCreationResultSchema
>
