import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import {
  getCortexFocusedGraph,
  getCortexGraph,
  getCortexNodeByRef,
} from '@third-code-erp/database'
import {
  cortexEntityDefinition,
  isCortexRefTable,
} from '@/lib/cortex/entity-registry'
import { cortexCanSeeType, cortexNodeTypeScope } from '@/lib/cortex/rbac'

const focusSchema = z
  .object({
    refTable: z.string().refine(isCortexRefTable).optional(),
    refId: z.string().uuid().optional(),
  })
  .refine(
    ({ refTable, refId }) =>
      (refTable === undefined && refId === undefined) ||
      (refTable !== undefined && refId !== undefined),
    'refTable and refId must be supplied together'
  )

/**
 * GET /api/cortex/graph
 *
 * Whole-graph payload for the interactive visualization. Tenant comes from the
 * session, so a caller only ever receives their own tenant's nodes + edges.
 */
export async function GET(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = focusSchema.safeParse({
    refTable: req.nextUrl.searchParams.get('refTable') ?? undefined,
    refId: req.nextUrl.searchParams.get('refId') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid graph focus' }, { status: 400 })
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
      return NextResponse.json(
        { error: 'Focused record not found' },
        { status: 404 }
      )
    }

    const graph = await getCortexFocusedGraph(
      profile.tenantId,
      node.id,
      40,
      scope
    )
    if (!graph) {
      return NextResponse.json(
        { error: 'Focused record not found' },
        { status: 404 }
      )
    }
    return NextResponse.json(graph, {
      headers: { 'Cache-Control': 'private, max-age=15' },
    })
  }

  // RBAC: only the node types this role may see (admin/owner = unrestricted).
  const graph = await getCortexGraph(profile.tenantId, 1500, scope)
  return NextResponse.json(graph, {
    headers: { 'Cache-Control': 'private, max-age=15' },
  })
}
