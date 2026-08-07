import { z } from 'zod'
import { cortexConversationAssistantTurnSucceededSchema } from './cortex-conversations'

export const CORTEX_ASSISTANT_GENERATION_MAX_ATTEMPTS = 3

const completionContentSchema = z
  .string()
  .max(100_000)
  .refine((value) => value.trim().length > 0, 'Content is required')
const completionCitationNodeIdsSchema = z.array(z.string().uuid()).max(12)
const providerModelSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._:/-]*$/, 'Invalid provider model key')

function citationsAreUnique(value: { citationNodeIds: string[] }): boolean {
  return new Set(value.citationNodeIds).size === value.citationNodeIds.length
}

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

export const cortexAssistantGenerationAcceptedSchema = z
  .object({
    status: z.literal('accepted'),
    jobId: z.string().uuid(),
    conversationId: z.string().uuid(),
    retryAfterMs: z.number().int().min(500).max(5_000),
  })
  .strict()

export const cortexAssistantGenerationResultSchema = z
  .object({
    job: cortexAssistantGenerationStatusSchema,
    result: cortexConversationAssistantTurnSucceededSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.job.status === 'succeeded') !== (value.result !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Succeeded jobs require a result and other states forbid one',
        path: ['result'],
      })
    }
  })

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
    content: completionContentSchema,
    citationNodeIds: completionCitationNodeIdsSchema,
    model: z.literal('deterministic-grounded-v1'),
  })
  .strict()
  .refine(citationsAreUnique, {
    message: 'Citation node IDs must be unique',
    path: ['citationNodeIds'],
  })

/** Internal Nest commit authority; never accepted from a browser/provider. */
export const cortexAssistantGenerationCommitCompletionSchema = z
  .discriminatedUnion('outcome', [
    z
      .object({
        outcome: z.literal('deterministic_grounded'),
        content: completionContentSchema,
        citationNodeIds: completionCitationNodeIdsSchema,
        model: z.literal('deterministic-grounded-v1'),
      })
      .strict(),
    z
      .object({
        outcome: z.literal('provider_grounded'),
        providerAttemptId: z.string().uuid(),
        content: completionContentSchema,
        citationNodeIds: completionCitationNodeIdsSchema,
        model: providerModelSchema,
      })
      .strict(),
  ])
  .refine(citationsAreUnique, {
    message: 'Citation node IDs must be unique',
    path: ['citationNodeIds'],
  })

export type CortexAssistantGenerationStartCommand = z.infer<
  typeof cortexAssistantGenerationStartCommandSchema
>
export type CortexAssistantGenerationStatus = z.infer<
  typeof cortexAssistantGenerationStatusSchema
>
export type CortexAssistantGenerationAccepted = z.infer<
  typeof cortexAssistantGenerationAcceptedSchema
>
export type CortexAssistantGenerationResult = z.infer<
  typeof cortexAssistantGenerationResultSchema
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
export type CortexAssistantGenerationCommitCompletion = z.infer<
  typeof cortexAssistantGenerationCommitCompletionSchema
>
