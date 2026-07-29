import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@third-code-erp/auth'
import { cortexDescribeEntity, getCortexNodeByRef } from '@third-code-erp/database'
import {
  cortexEntityDefinition,
  isCortexRefTable,
} from '@/lib/cortex/href'
import { cortexCanSeeType, cortexNodeTypeScope } from '@/lib/cortex/rbac'

/**
 * GET /api/cortex/entity/:refTable/:refId
 *
 * Cortex entity lookup — a source-grounded, citation-backed context pack for one
 * ERP record. Tenant comes from the session (never the URL). RBAC: the caller's
 * role must be allowed to see this node's type, else 404 (we don't reveal
 * existence of records the role can't open). Cortex obeys the same RBAC as the
 * human (spec §7).
 */

const paramsSchema = z.object({
  refTable: z
    .string()
    .refine(isCortexRefTable, 'Unsupported Cortex reference table'),
  refId: z.string().uuid(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ refTable: string; refId: string }> }
) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid entity reference', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { refTable, refId } = parsed.data

  try {
    // Resolve the node first to RBAC-gate on its type (tenant-scoped read).
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
      return NextResponse.json({ found: false, summary: '', citations: [] }, { status: 404 })
    }
    // RBAC: neighbors/citations in the pack are also scoped to the role, so an
    // in-scope record never leaks a forbidden-type connection.
    const scope = cortexNodeTypeScope(profile.role)
    const answer = await cortexDescribeEntity(profile.tenantId, refTable, refId, scope)
    return NextResponse.json(answer, { status: answer.found ? 200 : 404 })
  } catch {
    return NextResponse.json({ error: 'Cortex lookup failed' }, { status: 500 })
  }
}
