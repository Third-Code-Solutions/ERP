// Authenticated finance CSV exports (finance.read), scoped to the session tenant.
//
//   GET /api/finance/export/trial-balance?asOf=YYYY-MM-DD&period=<uuid>
//   GET /api/finance/export/ledger?account=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//   GET /api/finance/export/receivables-aging
//   GET /api/finance/export/payables-aging
import { NextResponse, type NextRequest } from 'next/server'
import { can, getUserProfile } from '@third-code-erp/auth'
import {
  buildFinanceExport,
  isFinanceExportReport,
} from '@/lib/finance/export-reports'
import { paramsRecord } from '@/lib/finance/params'

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status, headers: RESPONSE_HEADERS })
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ report: string }> }
): Promise<Response> {
  let profile: Awaited<ReturnType<typeof getUserProfile>>
  try {
    profile = await getUserProfile()
  } catch (error) {
    console.error('[finance/export] profile lookup failed', error)
    return jsonError('Export unavailable', 500)
  }

  if (!profile) return jsonError('Unauthorized', 401)
  if (!can(profile.role, 'finance.read')) return jsonError('Forbidden', 403)

  const { report } = await ctx.params
  if (!isFinanceExportReport(report)) return jsonError('Unknown export', 404)

  let result: Awaited<ReturnType<typeof buildFinanceExport>>
  try {
    result = await buildFinanceExport(
      report,
      profile.tenantId,
      paramsRecord(req.nextUrl.searchParams.entries())
    )
  } catch (error) {
    console.error(`[finance/export] ${report} failed`, error)
    return jsonError('Export unavailable', 500)
  }

  if (!result.ok) return jsonError(result.error, 400)

  return new Response(result.csv, {
    status: 200,
    headers: {
      ...RESPONSE_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      ...(result.truncated ? { 'X-Export-Truncated': 'true' } : {}),
    },
  })
}
