import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import {
  getCortexFocusedGraph,
  getCortexGraph,
  getCortexNodeByRef,
} from '@third-code-erp/database'
import { cortexGraphQuerySchema } from '@third-code-erp/shared-types'
import { cortexEntityDefinition } from '@/lib/cortex/entity-registry'
import { cortexCanSeeType, cortexNodeTypeScope } from '@/lib/cortex/rbac'
import { CORTEX_PRIVATE_HEADERS } from '@/lib/cortex/response'
import {
  cortexGraphReadsUseCoreApi,
  getCortexGraphThroughCoreApi,
} from '@/lib/erp-core-client'

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: CORTEX_PRIVATE_HEADERS,
  })
}

/**
 * GET /api/cortex/graph
 *
 * Whole-graph payload for the interactive visualization. Tenant comes from the
 * session, so a caller only ever receives their own tenant's nodes + edges.
 */
export async function GET(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return response({ error: 'Unauthorized' }, 401)
  }

  const parsed = cortexGraphQuerySchema.safeParse({
    refTable: req.nextUrl.searchParams.get('refTable') ?? undefined,
    refId: req.nextUrl.searchParams.get('refId') ?? undefined,
  })
  if (!parsed.success) {
    return response({ error: 'Invalid graph focus' }, 400)
  }

  if (cortexGraphReadsUseCoreApi(profile.tenantId)) {
    const result = await getCortexGraphThroughCoreApi(parsed.data)
    if (!result.ok || !result.data) {
      return response(
        { error: result.error ?? 'Cortex graph service is unavailable.' },
        result.status ?? 503
      )
    }
    return response(result.data)
  }

  const scope = cortexNodeTypeScope(profile.role)
  const { refTable, refId } = parsed.data
  if (refTable && refId) {
    const node = await getCortexNodeByRef(profile.tenantId, refTable, refId)
    const definition = node
      ? cortexEntityDefinition(node.node_type)
      : null
    if (
      !node ||
      !definition ||
      !definition.refTables.includes(refTable) ||
      !cortexCanSeeType(profile.role, node.node_type)
    ) {
      return response({ error: 'Focused record not found' }, 404)
    }

    const graph = await getCortexFocusedGraph(
      profile.tenantId,
      node.id,
      40,
      scope
    )
    if (!graph) {
      return response({ error: 'Focused record not found' }, 404)
    }
    return response(graph)
  }

  // RBAC: only the node types this role may see (admin/owner = unrestricted).
  const graph = await getCortexGraph(profile.tenantId, 1500, scope)
  return response(graph)
}
