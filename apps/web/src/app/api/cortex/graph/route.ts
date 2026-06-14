import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@buildops/auth'
import { getCortexGraph } from '@buildops/database'

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
  const graph = await getCortexGraph(profile.tenantId)
  return NextResponse.json(graph, {
    headers: { 'Cache-Control': 'private, max-age=15' },
  })
}
