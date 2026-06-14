import type { AppRole } from '@buildops/auth'
import { canViewPath, canonicalRole } from '@/lib/abi/nav-config'

/**
 * Cortex RBAC — the AI Brain obeys the SAME role permissions as the human who
 * invoked it (spec §7). A graph node type is visible to a role iff that role is
 * allowed to view the corresponding ERP module (reuses the sidebar `canViewPath`
 * matrix, so Cortex never widens access beyond the UI).
 *
 * Admin / owner get unrestricted access (scope = null → no filter), so they also
 * see any future node type before it is mapped here.
 */
const NODE_TYPE_PATH: Record<string, string> = {
  // Project-scoped execution records
  project: '/projects',
  scope_item: '/projects',
  change_order: '/projects',
  certificate: '/projects',
  schedule_event: '/projects',
  weekly_report: '/projects',
  contract: '/projects',
  // Sales / proposal
  opportunity: '/pipeline/board',
  inspection: '/pipeline/board',
  design: '/pipeline/board',
  change_request: '/pipeline/board',
  account: '/crm/accounts',
  contact: '/crm/accounts',
  // Commercial / estimating
  bom: '/bom',
  material: '/bom',
  // Procurement
  purchase_order: '/purchase-orders',
  vendor: '/purchase-orders',
  delivery: '/procurement/deliveries',
  rfq: '/procurement/rfqs',
  // Finance
  invoice: '/invoices',
  claim: '/claims',
  // Operations
  permit: '/permits',
  ticket: '/warranty',
  punchlist: '/punchlist',
  // Everyone
  document: '/documents',
  task: '/tasks',
  // Admin only
  employee: '/admin',
  audit_event: '/admin',
}

const ALL_TYPES = Object.keys(NODE_TYPE_PATH)

/**
 * The node types a role may see, or `null` for unrestricted (admin/owner).
 * Callers pass the array to graph/retrieval queries as a `nodeTypes` filter;
 * `null` means "no filter".
 */
export function cortexNodeTypeScope(role: AppRole): string[] | null {
  if (canonicalRole(role) === 'admin') return null
  return ALL_TYPES.filter((t) => canViewPath(role, NODE_TYPE_PATH[t]!))
}

/** Whether a role may see a single node type (used to gate entity lookups). */
export function cortexCanSeeType(role: AppRole, type: string): boolean {
  if (canonicalRole(role) === 'admin') return true
  const path = NODE_TYPE_PATH[type]
  if (!path) return true // unmapped type — keep the map current; don't hide
  return canViewPath(role, path)
}
