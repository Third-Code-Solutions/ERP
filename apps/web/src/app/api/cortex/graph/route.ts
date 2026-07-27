import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import { getCortexGraph } from '@third-code-erp/database'
import { cortexNodeTypeScope } from '@/lib/cortex/rbac'

/**
 * GET /api/cortex/graph
 *
 * Whole-graph payload for the interactive visualization. Tenant comes from the
 * session, so a caller only ever receives their own tenant's nodes + edges.
 */
export async function GET(_req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // RBAC: only the node types this role may see (admin/owner = unrestricted).
  const scope = cortexNodeTypeScope(profile.role)
  const graph = await getCortexGraph(profile.tenantId, 1500, scope)
  return NextResponse.json(graph, {
    headers: { 'Cache-Control': 'private, max-age=15' },
  })
}
