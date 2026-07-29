import type { AppRole } from '@third-code-erp/auth'
import { canViewPath, canonicalRole } from '@/lib/operations/nav-config'
import {
  CORTEX_ENTITY_TYPES,
  cortexEntityDefinition,
} from './entity-registry'

/**
 * Cortex RBAC — the AI Brain obeys the SAME role permissions as the human who
 * invoked it (spec §7). A graph node type is visible to a role iff that role is
 * allowed to view the corresponding ERP module (reuses the sidebar `canViewPath`
 * matrix, so Cortex never widens access beyond the UI).
 *
 * Admin / owner get unrestricted access (scope = null → no filter). Every
 * other role is deny-by-default when a new node type has not been mapped.
 */
/**
 * The node types a role may see, or `null` for unrestricted (admin/owner).
 * Callers pass the array to graph/retrieval queries as a `nodeTypes` filter;
 * `null` means "no filter".
 */
export function cortexNodeTypeScope(role: AppRole): string[] | null {
  if (canonicalRole(role) === 'admin') return null
  return CORTEX_ENTITY_TYPES.filter((type) => {
    const definition = cortexEntityDefinition(type)
    return definition
      ? canViewPath(role, definition.accessPath)
      : false
  })
}

/** Whether a role may see a single node type (used to gate entity lookups). */
export function cortexCanSeeType(role: AppRole, type: string): boolean {
  if (canonicalRole(role) === 'admin') return true
  const definition = cortexEntityDefinition(type)
  return definition
    ? canViewPath(role, definition.accessPath)
    : false
}
