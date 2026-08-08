import { z } from 'zod'
import { cortexCitationSchema } from './cortex-entity'
import { cortexGraphRefTableSchema } from './cortex-graph'
import { cortexBriefStatsSchema } from './cortex-brief'
import { cortexSearchFreshnessValues } from './cortex-search'

/**
 * Bounded retrieval input for the Cortex chat context pack.
 *
 * Tenant, user, and role scope are always supplied by the authenticated Core
 * principal. A browser cannot widen the graph scope or request an unbounded
 * context window.
 */
export const cortexChatRetrievalFocusSchema = z
  .object({
    refTable: cortexGraphRefTableSchema,
    refId: z.string().uuid(),
  })
  .strict()

export type CortexChatRetrievalFocus = z.infer<
  typeof cortexChatRetrievalFocusSchema
>

const cortexChatRetrievalFocusInputSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}, cortexChatRetrievalFocusSchema)

export const cortexChatRetrievalQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(2_000),
    // Core GET transport may carry the focus object as encoded JSON. Direct
    // callers may still pass the structured object.
    focus: cortexChatRetrievalFocusInputSchema.optional(),
    recentLimit: z.coerce.number().int().min(1).max(40).default(40),
    matchLimit: z.coerce.number().int().min(1).max(12).default(12),
  })
  .strict()

export type CortexChatRetrievalQuery = z.infer<
  typeof cortexChatRetrievalQuerySchema
>

export const cortexChatRetrievalItemSchema = z
  .object({
    id: z.string().uuid(),
    nodeType: z.string().trim().min(1).max(64),
    title: z.string().trim().max(500).nullable(),
    summary: z.string().nullable(),
    refTable: cortexGraphRefTableSchema,
    refId: z.string().uuid(),
    projectId: z.string().uuid().nullable(),
    freshness: z.enum(cortexSearchFreshnessValues),
    recordedAt: z.string().datetime({ offset: true }),
    source: z.literal('cortex'),
  })
  .strict()

export type CortexChatRetrievalItem = z.infer<
  typeof cortexChatRetrievalItemSchema
>

export const cortexChatRetrievalFocusedSchema = z
  .object({
    found: z.boolean(),
    summary: z.string().max(100_000),
    citations: z.array(cortexCitationSchema).max(13),
  })
  .strict()

export type CortexChatRetrievalFocused = z.infer<
  typeof cortexChatRetrievalFocusedSchema
>

export const cortexChatRetrievalKeywordAnswerSchema = z
  .object({
    answer: z.string().max(100_000),
    citations: z.array(cortexCitationSchema).max(8),
  })
  .strict()

export const cortexChatRetrievalSemanticStatusSchema = z.enum([
  'not_migrated',
  'disabled',
  'not_indexed',
  'unavailable',
])

export const cortexChatRetrievalResultSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    stats: cortexBriefStatsSchema,
    recent: z.array(cortexChatRetrievalItemSchema).max(40),
    matches: z.array(cortexChatRetrievalItemSchema).max(12),
    focused: cortexChatRetrievalFocusedSchema.nullable(),
    keywordAnswer: cortexChatRetrievalKeywordAnswerSchema,
    semanticStatus: cortexChatRetrievalSemanticStatusSchema,
  })
  .strict()

export type CortexChatRetrievalResult = z.infer<
  typeof cortexChatRetrievalResultSchema
>
