import type { AppRole } from '@third-code-erp/auth'
import { getCortexNodeByRef } from '@third-code-erp/database'
import { cortexEntityDefinition } from './entity-registry'
import { cortexCanSeeType } from './rbac'

export interface CortexRecordContext {
  refTable: string
  refId: string
}

export interface AuthorizedCortexRecordContext extends CortexRecordContext {
  nodeId: string
  nodeType: string
  title: string | null
}

/**
 * Resolves a canonical ERP row through the tenant graph and applies current
 * role access. Missing, mismatched, and forbidden rows share the same result
 * so callers cannot enumerate records through Cortex.
 */
export async function authorizeCortexRecordContext(
  tenantId: string,
  role: AppRole,
  context: CortexRecordContext
): Promise<AuthorizedCortexRecordContext | null> {
  const node = await getCortexNodeByRef(
    tenantId,
    context.refTable,
    context.refId
  )
  const definition = node ? cortexEntityDefinition(node.node_type) : null
  if (
    !node ||
    !definition ||
    !definition.refTables.includes(context.refTable) ||
    !cortexCanSeeType(role, node.node_type)
  ) {
    return null
  }

  return {
    refTable: context.refTable,
    refId: context.refId,
    nodeId: node.id,
    nodeType: node.node_type,
    title: node.title,
  }
}
