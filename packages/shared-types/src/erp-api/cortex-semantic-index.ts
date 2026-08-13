import { z } from 'zod'

export const CORTEX_SEMANTIC_INDEX_MAX_NODES = 64
export const CORTEX_SEMANTIC_INDEX_MAX_ATTEMPTS = 3

export const cortexSemanticIndexCommandSchema = z
  .object({
    maxNodes: z.literal(CORTEX_SEMANTIC_INDEX_MAX_NODES),
    costConsent: z.literal(true),
  })
  .strict()

export const cortexSemanticIndexQueueJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.string().uuid(),
  })
  .strict()

/** Internal BullMQ scheduler payload. It carries no tenant or ERP authority. */
export const cortexSemanticIndexRecoveryJobSchema = z
  .object({ schemaVersion: z.literal(1) })
  .strict()

export const cortexSemanticIndexStatusSchema = z
  .object({
    jobId: z.string().uuid(),
    status: z.enum(['queued', 'processing', 'succeeded', 'failed']),
    maxNodes: z.literal(CORTEX_SEMANTIC_INDEX_MAX_NODES),
    backlogAtRequest: z.number().int().nonnegative(),
    processedNodes: z
      .number()
      .int()
      .min(0)
      .max(CORTEX_SEMANTIC_INDEX_MAX_NODES),
    attempts: z
      .number()
      .int()
      .min(0)
      .max(CORTEX_SEMANTIC_INDEX_MAX_ATTEMPTS),
    providerCalls: z.number().int().min(0).max(1),
    failureCode: z.string().trim().min(1).max(100).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const cortexSemanticIndexAcceptedSchema = z
  .object({
    jobId: z.string().uuid(),
    status: z.literal('queued'),
    maxNodes: z.literal(CORTEX_SEMANTIC_INDEX_MAX_NODES),
    backlogAtRequest: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type CortexSemanticIndexCommand = z.infer<
  typeof cortexSemanticIndexCommandSchema
>
export type CortexSemanticIndexQueueJob = z.infer<
  typeof cortexSemanticIndexQueueJobSchema
>
export type CortexSemanticIndexRecoveryJob = z.infer<
  typeof cortexSemanticIndexRecoveryJobSchema
>
export type CortexSemanticIndexStatus = z.infer<
  typeof cortexSemanticIndexStatusSchema
>
export type CortexSemanticIndexAccepted = z.infer<
  typeof cortexSemanticIndexAcceptedSchema
>
