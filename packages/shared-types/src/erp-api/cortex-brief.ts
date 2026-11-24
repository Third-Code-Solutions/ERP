import { z } from 'zod'
import { isoDateTimeString } from '../iso-datetime'
import { cortexSearchFreshnessValues } from './cortex-search'

/** Bounded read input for the permission-scoped Cortex operating brief. */
export const cortexBriefQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(24).default(12),
  })
  .strict()

export type CortexBriefQuery = z.infer<typeof cortexBriefQuerySchema>

export const cortexBriefStatsSchema = z
  .object({
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    provenance: z.number().int().nonnegative(),
    byType: z
      .array(
        z
          .object({
            nodeType: z.string().trim().min(1).max(64),
            count: z.number().int().nonnegative(),
          })
          .strict()
      )
      .max(128),
  })
  .strict()

export const cortexBriefFreshnessSchema = z
  .object({
    fresh: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .strict()

export const cortexBriefItemSchema = z
  .object({
    id: z.string().guid(),
    nodeType: z.string().trim().min(1).max(64),
    title: z.string().trim().max(500).nullable(),
    summary: z.string().nullable(),
    refTable: z.string().trim().min(1).max(100),
    refId: z.string().guid(),
    projectId: z.string().guid().nullable(),
    freshness: z.enum(cortexSearchFreshnessValues),
    recordedAt: isoDateTimeString({ offset: true }),
    source: z.literal('cortex'),
  })
  .strict()

export type CortexBriefItem = z.infer<typeof cortexBriefItemSchema>

export const cortexBriefResultSchema = z
  .object({
    generatedAt: isoDateTimeString({ offset: true }),
    stats: cortexBriefStatsSchema,
    freshness: cortexBriefFreshnessSchema,
    items: z.array(cortexBriefItemSchema).max(24),
  })
  .strict()

export type CortexBriefResult = z.infer<typeof cortexBriefResultSchema>
