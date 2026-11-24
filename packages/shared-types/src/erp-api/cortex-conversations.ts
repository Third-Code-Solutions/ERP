import { z } from 'zod'
import { isoDateTimeString } from '../iso-datetime'
import { cortexCitationSchema } from './cortex-entity'
import { cortexGraphRefTableSchema } from './cortex-graph'

export const cortexConversationIdSchema = z.string().guid()

export const cortexConversationContextSchema = z
  .object({
    refTable: cortexGraphRefTableSchema,
    refId: z.string().guid(),
    nodeId: z.string().guid(),
    nodeType: z.string().trim().min(1).max(64),
    title: z.string().max(500).nullable(),
  })
  .strict()

export const cortexConversationSummarySchema = z
  .object({
    id: cortexConversationIdSchema,
    title: z.string().max(255).nullable(),
    created_at: isoDateTimeString({ offset: true }),
    updated_at: isoDateTimeString({ offset: true }),
    context: cortexConversationContextSchema.nullable(),
  })
  .strict()

export const cortexConversationListResponseSchema = z
  .object({
    conversations: z.array(cortexConversationSummarySchema).max(30),
  })
  .strict()

export const cortexConversationMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(100_000),
    created_at: isoDateTimeString({ offset: true }),
    citations: z.array(cortexCitationSchema).max(200),
  })
  .strict()

export const cortexConversationDetailResponseSchema = z
  .object({
    context: cortexConversationContextSchema.nullable(),
    messages: z.array(cortexConversationMessageSchema).max(1_000),
  })
  .strict()

export const cortexConversationUserTurnCommandSchema = z
  .object({
    conversationId: cortexConversationIdSchema.optional(),
    context: z
      .object({
        refTable: cortexGraphRefTableSchema,
        refId: z.string().guid(),
      })
      .strict()
      .optional(),
    content: z
      .string()
      .max(20_000)
      .refine((value) => value.trim().length > 0, 'Content is required'),
  })
  .strict()

export const cortexConversationUserTurnResultSchema = z
  .object({
    conversationId: cortexConversationIdSchema,
    messageId: z.string().guid(),
    status: z.enum(['created', 'appended']),
  })
  .strict()

export const cortexConversationAssistantTurnOutcomeSchema = z.enum([
  'model',
  'model_stream_failed_partial',
  'model_failed_grounded_fallback',
  'deterministic_grounded',
  'provider_grounded',
])

// Signed external completion remains unable to claim provider authority.
// Provider-grounded commits use the internal generation completion contract.
export const cortexConversationAssistantTurnExternalOutcomeSchema = z.enum([
  'model',
  'model_stream_failed_partial',
  'model_failed_grounded_fallback',
  'deterministic_grounded',
])

export const cortexConversationAssistantTurnClaimCommandSchema = z
  .object({
    conversationId: cortexConversationIdSchema,
    userMessageId: z.string().guid(),
  })
  .strict()

export const cortexConversationAssistantTurnSucceededSchema = z
  .object({
    status: z.literal('succeeded'),
    conversationId: cortexConversationIdSchema,
    userMessageId: z.string().guid(),
    messageId: z.string().guid(),
    content: z.string().max(100_000),
    citations: z.array(cortexCitationSchema).max(12),
    outcome: cortexConversationAssistantTurnOutcomeSchema,
    model: z.string().trim().min(1).max(100),
  })
  .strict()

export const cortexConversationAssistantTurnClaimResultSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('claimed'),
        conversationId: cortexConversationIdSchema,
        userMessageId: z.string().guid(),
        requestId: z.string().guid(),
        claimToken: z.string().guid(),
        leaseExpiresAt: isoDateTimeString({ offset: true }),
      })
      .strict(),
    z
      .object({
        status: z.literal('in_progress'),
        conversationId: cortexConversationIdSchema,
        userMessageId: z.string().guid(),
        retryAfterSeconds: z.number().int().min(1).max(300),
      })
      .strict(),
    cortexConversationAssistantTurnSucceededSchema,
  ]
)

export const cortexConversationAssistantTurnCompleteCommandSchema = z
  .object({
    requestId: z.string().guid(),
    claimToken: z.string().guid(),
    content: z
      .string()
      .max(100_000)
      .refine((value) => value.trim().length > 0, 'Content is required'),
    citationNodeIds: z.array(z.string().guid()).max(12),
    outcome: cortexConversationAssistantTurnExternalOutcomeSchema,
    model: z.string().trim().min(1).max(100),
  })
  .strict()
  .refine(
    (value) => new Set(value.citationNodeIds).size === value.citationNodeIds.length,
    { message: 'Citation node IDs must be unique', path: ['citationNodeIds'] }
  )

export const cortexConversationAssistantTurnCompleteResultSchema = z
  .object({
    status: z.literal('created'),
    conversationId: cortexConversationIdSchema,
    userMessageId: z.string().guid(),
    messageId: z.string().guid(),
  })
  .strict()

export const CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION = 'v1' as const
export const CORTEX_ASSISTANT_TURN_SIGNATURE_MAX_AGE_SECONDS = 60

export function cortexConversationAssistantTurnSignaturePayload(input: {
  operation: 'claim' | 'complete' | 'start_job'
  timestamp: string
  tenantId: string
  userId: string
  idempotencyKey: string
  commandDigest: string
}): string {
  return JSON.stringify({
    version: CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION,
    operation: input.operation,
    timestamp: input.timestamp,
    tenantId: input.tenantId,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    commandDigest: input.commandDigest,
  })
}

export type CortexConversationContext = z.infer<
  typeof cortexConversationContextSchema
>
export type CortexConversationSummary = z.infer<
  typeof cortexConversationSummarySchema
>
export type CortexConversationListResponse = z.infer<
  typeof cortexConversationListResponseSchema
>
export type CortexConversationDetailResponse = z.infer<
  typeof cortexConversationDetailResponseSchema
>
export type CortexConversationUserTurnCommand = z.infer<
  typeof cortexConversationUserTurnCommandSchema
>
export type CortexConversationUserTurnResult = z.infer<
  typeof cortexConversationUserTurnResultSchema
>
export type CortexConversationAssistantTurnOutcome = z.infer<
  typeof cortexConversationAssistantTurnOutcomeSchema
>
export type CortexConversationAssistantTurnClaimCommand = z.infer<
  typeof cortexConversationAssistantTurnClaimCommandSchema
>
export type CortexConversationAssistantTurnClaimResult = z.infer<
  typeof cortexConversationAssistantTurnClaimResultSchema
>
export type CortexConversationAssistantTurnSucceeded = z.infer<
  typeof cortexConversationAssistantTurnSucceededSchema
>
export type CortexConversationAssistantTurnCompleteCommand = z.infer<
  typeof cortexConversationAssistantTurnCompleteCommandSchema
>
export type CortexConversationAssistantTurnCompleteResult = z.infer<
  typeof cortexConversationAssistantTurnCompleteResultSchema
>
