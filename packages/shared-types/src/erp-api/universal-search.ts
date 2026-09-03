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
  'vendor',
  'material',
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

/**
 * Roles understood by every universal-search authority. Legacy roles remain
 * in the contract because existing tenants can still have them persisted.
 */
export const universalSearchRoles = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
] as const
export const universalSearchRoleSchema = z.enum(universalSearchRoles)
export type UniversalSearchRole = z.infer<typeof universalSearchRoleSchema>

const UNIVERSAL_SEARCH_ROLE_BY_TYPE: Record<
  UniversalSearchHitType,
  readonly UniversalSearchRole[]
> = {
  account: ['admin', 'sales', 'commercial', 'sd_pm_pe', 'finance', 'cx', 'viewer'],
  vendor: ['admin', 'commercial', 'sd_pm_pe', 'procurement', 'viewer'],
  material: ['owner', 'admin', 'commercial', 'viewer'],
  project: [
    'admin',
    'sales',
    'commercial',
    'design',
    'sd_pm_pe',
    'finance',
    'procurement',
    'viewer',
  ],
  opportunity: [
    'admin',
    'sales',
    'commercial',
    'design',
    'sd_pm_pe',
    'finance',
    'procurement',
    'viewer',
  ],
  bom: ['admin', 'commercial', 'viewer'],
  po: ['admin', 'commercial', 'sd_pm_pe', 'procurement', 'viewer'],
  invoice: ['admin', 'finance', 'viewer'],
  claim: ['admin', 'finance', 'sd_pm_pe', 'commercial', 'viewer'],
  document: [...universalSearchRoles],
  task: [...universalSearchRoles],
  permit: ['admin', 'commercial', 'sd_pm_pe', 'safety', 'viewer'],
  punchlist: ['admin', 'sd_pm_pe', 'cx', 'safety', 'viewer'],
  warranty: ['admin', 'cx', 'viewer'],
  delivery: ['admin', 'procurement', 'sd_pm_pe', 'viewer'],
  rfq: ['admin', 'procurement', 'commercial', 'viewer'],
  ledger_account: ['admin', 'finance', 'viewer'],
  journal_entry: ['admin', 'finance', 'viewer'],
}

const UNIVERSAL_SEARCH_CANONICAL_ROLE: Record<
  UniversalSearchRole,
  UniversalSearchRole
> = {
  owner: 'admin',
  estimator: 'commercial',
  pm: 'sd_pm_pe',
  admin: 'admin',
  sales: 'sales',
  commercial: 'commercial',
  design: 'design',
  sd_pm_pe: 'sd_pm_pe',
  finance: 'finance',
  procurement: 'procurement',
  safety: 'safety',
  cx: 'cx',
  viewer: 'viewer',
}

/** Shared RBAC policy; callers must still enforce tenant membership. */
export function canUniversalSearchEntity(
  role: UniversalSearchRole,
  type: UniversalSearchHitType
): boolean {
  // Material results link to /admin/material-items. Legacy estimator/pm
  // aliases must not inherit a result whose only destination rejects them.
  const policyRole = type === 'material'
    ? role
    : UNIVERSAL_SEARCH_CANONICAL_ROLE[role]
  return UNIVERSAL_SEARCH_ROLE_BY_TYPE[type].includes(
    policyRole
  )
}

/** Bounded query accepted by the Core read adapter. */
export const universalSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    limit: z.coerce.number().int().min(1).max(80).default(80),
  })
  .strict()

export type UniversalSearchQuery = z.infer<typeof universalSearchQuerySchema>

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
