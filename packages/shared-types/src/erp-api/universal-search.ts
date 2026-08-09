import { z } from 'zod'

/**
 * Canonical record kinds exposed by the operator search surface.
 *
 * This contract is shared by the current Web compatibility route and the
 * future NestJS read authority. It intentionally contains navigation-safe
 * fields only; tenant, role, query plans, and database diagnostics never
 * cross this boundary.
 */
export const universalSearchHitTypes = [
  'account',
  'project',
  'opportunity',
  'bom',
  'po',
  'invoice',
  'claim',
  'document',
  'task',
  'permit',
  'punchlist',
  'warranty',
  'delivery',
  'rfq',
  'ledger_account',
  'journal_entry',
] as const

export const universalSearchHitTypeSchema = z.enum(universalSearchHitTypes)
export type UniversalSearchHitType = z.infer<
  typeof universalSearchHitTypeSchema
>

export const universalSearchHitSchema = z
  .object({
    type: universalSearchHitTypeSchema,
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(500),
    subtitle: z.string().trim().max(500).optional(),
    href: z.string().trim().regex(/^\/(?!\/)/).max(500),
  })
  .strict()

export type UniversalSearchHit = z.infer<typeof universalSearchHitSchema>

export const universalSearchStatusValues = ['complete', 'partial'] as const
export const universalSearchResultSchema = z
  .object({
    hits: z.array(universalSearchHitSchema).max(80),
    status: z.enum(universalSearchStatusValues),
    failedTypes: z.array(universalSearchHitTypeSchema).max(16),
    hint: z.string().trim().max(200).optional(),
  })
  .strict()

export type UniversalSearchResult = z.infer<
  typeof universalSearchResultSchema
>
