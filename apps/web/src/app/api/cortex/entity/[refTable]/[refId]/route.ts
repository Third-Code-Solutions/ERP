import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@buildops/auth'
import { cortexDescribeEntity, getCortexNodeByRef } from '@buildops/database'
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

// Every table Cortex mirrors into the graph is queryable.
const REF_TABLES = [
  'projects',
  'accounts',
  'users',
  'opportunities',
  'documents',
  'boms',
  'purchase_orders',
  'invoices',
  'daily_tasks',
  'vendors',
  'scope_items',
  'contacts',
  'permits',
  'variation_orders',
  'progress_claims',
  'warranty_tickets',
  'delivery_schedules',
  'rfqs',
  'contracts',
  'certificates_of_completion',
  'punchlist_items',
  'site_inspections',
  'design_files',
  'change_requests',
  'master_schedules',
  'material_items',
  'weekly_reports',
  'pre_con_checklist_items',
] as const

const paramsSchema = z.object({
  refTable: z.enum(REF_TABLES),
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
    if (!node || !cortexCanSeeType(profile.role, node.node_type)) {
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
