import type { AppRole } from '@third-code-erp/auth'
import { canViewPath } from '@/lib/operations/nav-config'

export type SearchHitType =
  | 'account'
  | 'project'
  | 'opportunity'
  | 'bom'
  | 'po'
  | 'invoice'
  | 'claim'
  | 'document'
  | 'task'
  | 'permit'
  | 'punchlist'
  | 'warranty'
  | 'delivery'
  | 'rfq'
  | 'ledger_account'
  | 'journal_entry'

const SEARCH_PATH_BY_TYPE: Record<SearchHitType, string> = {
  account: '/crm/accounts',
  project: '/projects',
  opportunity: '/pipeline/board',
  bom: '/bom',
  po: '/purchase-orders',
  invoice: '/invoices',
  claim: '/claims',
  document: '/documents',
  task: '/tasks',
  permit: '/permits',
  punchlist: '/punchlist',
  warranty: '/warranty',
  delivery: '/procurement/deliveries',
  rfq: '/procurement/rfqs',
  ledger_account: '/finance',
  journal_entry: '/finance',
}

export const MAX_SEARCH_QUERY_LENGTH = 100

export function normalizeSearchQuery(value: string | null): string {
  return (value ?? '').trim().slice(0, MAX_SEARCH_QUERY_LENGTH)
}

/**
 * Build a PostgreSQL ILIKE pattern that treats user input as literal text.
 * Backslashes must be escaped before `%` and `_` so input cannot change
 * wildcard semantics.
 */
export function literalSearchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`
}

/** Keep search visibility aligned with the dashboard route policy. */
export function canSearchEntity(role: AppRole, type: SearchHitType): boolean {
  return canViewPath(role, SEARCH_PATH_BY_TYPE[type])
}
