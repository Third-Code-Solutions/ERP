import { z } from 'zod'
import {
  cortexGraphRefTableMatchesType,
  cortexGraphRefTableSchema,
} from './cortex-graph'

export const cortexSearchFreshnessValues = [
  'fresh',
  'stale',
  'unknown',
] as const

/**
 * Bounded, literal Cortex retrieval input. The session supplies tenant and
 * role; callers never supply a tenant or a node-type scope.
 */
export const cortexSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict()

export type CortexSearchQuery = z.infer<typeof cortexSearchQuerySchema>

export const cortexSearchHitSchema = z
  .object({
    id: z.string().uuid(),
    nodeType: z.string().trim().min(1).max(64),
    title: z.string().trim().max(500).nullable(),
    summary: z.string().nullable(),
    refTable: cortexGraphRefTableSchema,
    refId: z.string().uuid(),
    projectId: z.string().uuid().nullable(),
    freshness: z.enum(cortexSearchFreshnessValues),
    source: z.literal('cortex'),
  })
  .strict()
  .superRefine((hit, ctx) => {
    if (!cortexGraphRefTableMatchesType(hit.refTable, hit.nodeType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['refTable'],
        message: 'Cortex source table does not match node type',
      })
    }
  })

export type CortexSearchHit = z.infer<typeof cortexSearchHitSchema>

export const cortexSearchResultSchema = z
  .object({
    hits: z.array(cortexSearchHitSchema).max(20),
  })
  .strict()

export type CortexSearchResult = z.infer<typeof cortexSearchResultSchema>

/** Keep keyword retrieval bounded and literal before a database call. */
export function cortexSearchTerms(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3)
    .slice(0, 8)
}
