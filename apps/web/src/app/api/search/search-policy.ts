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

/** Keep search visibility aligned with the dashboard route policy. */
export function canSearchEntity(role: AppRole, type: SearchHitType): boolean {
  return canViewPath(role, SEARCH_PATH_BY_TYPE[type])
}
