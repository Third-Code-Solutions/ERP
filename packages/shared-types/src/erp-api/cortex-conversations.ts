import { z } from 'zod'
import { cortexCitationSchema } from './cortex-entity'
import { cortexGraphRefTableSchema } from './cortex-graph'

export const cortexConversationIdSchema = z.string().uuid()

export const cortexConversationContextSchema = z
  .object({
    refTable: cortexGraphRefTableSchema,
    refId: z.string().uuid(),
    nodeId: z.string().uuid(),
    nodeType: z.string().trim().min(1).max(64),
    title: z.string().max(500).nullable(),
  })
  .strict()

export const cortexConversationSummarySchema = z
  .object({
    id: cortexConversationIdSchema,
    title: z.string().max(255).nullable(),
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
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
    created_at: z.string().datetime({ offset: true }),
    citations: z.array(cortexCitationSchema).max(200),
  })
  .strict()

export const cortexConversationDetailResponseSchema = z
  .object({
    context: cortexConversationContextSchema.nullable(),
    messages: z.array(cortexConversationMessageSchema).max(1_000),
  })
  .strict()

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
