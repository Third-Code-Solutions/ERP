import { z } from 'zod'

export const CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS = 3

export const cortexAssistantGenerationStartCommandSchema = z
  .object({
    requestId: z.string().uuid(),
    claimToken: z.string().uuid(),
  })
  .strict()

export const cortexAssistantGenerationStatusValueSchema = z.enum([
  'queued',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
])

export const cortexAssistantGenerationStatusSchema = z
  .object({
    jobId: z.string().uuid(),
    requestId: z.string().uuid(),
    status: cortexAssistantGenerationStatusValueSchema,
    attemptCount: z
      .number()
      .int()
      .min(0)
      .max(CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS),
    failureCode: z.string().trim().min(1).max(100).nullable(),
    retryable: z.boolean(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const cortexAssistantGenerationQueueJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.string().uuid(),
  })
  .strict()

export const cortexAssistantGenerationRecoveryJobSchema = z
  .object({ schemaVersion: z.literal(1) })
  .strict()

export const cortexAssistantGenerationWorkerCompletionSchema = z
  .object({
    content: z
      .string()
      .max(100_000)
      .refine((value) => value.trim().length > 0, 'Content is required'),
    citationNodeIds: z.array(z.string().uuid()).max(12),
    model: z.literal('deterministic-grounded-v1'),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.citationNodeIds).size === value.citationNodeIds.length,
    { message: 'Citation node IDs must be unique', path: ['citationNodeIds'] }
  )

export type CortexAssistantGenerationStartCommand = z.infer<
  typeof cortexAssistantGenerationStartCommandSchema
>
export type CortexAssistantGenerationStatus = z.infer<
  typeof cortexAssistantGenerationStatusSchema
>
export type CortexAssistantGenerationQueueJob = z.infer<
  typeof cortexAssistantGenerationQueueJobSchema
>
export type CortexAssistantGenerationRecoveryJob = z.infer<
  typeof cortexAssistantGenerationRecoveryJobSchema
>
export type CortexAssistantGenerationWorkerCompletion = z.infer<
  typeof cortexAssistantGenerationWorkerCompletionSchema
>
