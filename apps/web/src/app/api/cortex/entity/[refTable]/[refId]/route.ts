import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserProfile } from '@buildops/auth'
import { cortexDescribeEntity } from '@buildops/database'

/**
 * GET /api/cortex/entity/:refTable/:refId
 *
 * Cortex entity lookup — returns a source-grounded, citation-backed context
 * pack for one ERP entity. The tenant is taken from the authenticated session
 * (NEVER from the URL), so a caller can only ever see their own tenant's graph:
 * requesting another tenant's refId resolves to `found: false`, no leak.
 *
 * Every role carries `cortex.query` (Appendix A), scoped to that role's read
 * scope — and the graph read itself is tenant-scoped, so authorization is the
 * combination of "is signed in" + "tenant filter at the source".
 */

// Only entities Cortex actually mirrors are queryable.
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
    // tenantId from session — the isolation boundary.
    const answer = await cortexDescribeEntity(profile.tenantId, refTable, refId)
    return NextResponse.json(answer, { status: answer.found ? 200 : 404 })
  } catch {
    return NextResponse.json({ error: 'Cortex lookup failed' }, { status: 500 })
  }
}
