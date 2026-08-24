import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import { opportunityStageValues } from '@third-code-erp/shared-types'
import { getOpportunitiesForExport } from '@/lib/dashboard-queries'
import { parseDashboardFilters } from '@/lib/dashboard-filters'

// CSV-safe escaping per RFC-4180. Wrap in quotes when the value contains
// a comma, double-quote, CR or LF, and double up any embedded quotes.
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const HEADERS = [
  'id',
  'account_name',
  'project_name',
  'stage',
  'tcv_php',
  'gp_php',
  'probability',
  'weighted_tcv_php',
  'closing_date',
  'rep_email',
] as const

export async function GET(req: NextRequest) {
  const profile = await getUserProfile()
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const sinceParam = url.searchParams.get('since') ?? undefined
  const untilParam = url.searchParams.get('until') ?? undefined
  const repParam = url.searchParams.get('rep') ?? undefined
  const stageParam = url.searchParams.get('stage') ?? undefined
  const parsedFilters = parseDashboardFilters({
    since: sinceParam,
    until: untilParam,
    rep: repParam,
  })
  if (parsedFilters.errors.length > 0) {
    return NextResponse.json(
      { error: parsedFilters.errors.join(' ') },
      { status: 400 }
    )
  }
  if (stageParam && !opportunityStageValues.includes(stageParam as never)) {
    return NextResponse.json({ error: 'Invalid `stage` filter' }, { status: 400 })
  }

  const rows = await getOpportunitiesForExport({
    tenantId: profile.tenantId,
    ...parsedFilters.filters,
    stage: stageParam,
  })

  // Stream the CSV as a ReadableStream so very large exports don't buffer
  // the entire body in memory.
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(HEADERS.join(',') + '\r\n'))
      for (const r of rows) {
        const line = HEADERS.map((h) => csvEscape(String(r[h] ?? ''))).join(',')
        controller.enqueue(encoder.encode(line + '\r\n'))
      }
      controller.close()
    },
  })

  const today = new Date().toISOString().slice(0, 10)
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="abi-ops-pipeline-export-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
