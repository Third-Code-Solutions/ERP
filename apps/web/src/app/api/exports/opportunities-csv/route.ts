import { NextResponse, type NextRequest } from 'next/server'
import { getUserProfile } from '@third-code-erp/auth'
import { getOpportunitiesForExport } from '@/lib/dashboard-queries'

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
  const sinceParam = url.searchParams.get('since')
  const untilParam = url.searchParams.get('until')
  const stageParam = url.searchParams.get('stage') ?? undefined

  const since = sinceParam ? new Date(sinceParam) : undefined
  const until = untilParam ? new Date(untilParam) : undefined

  // Validate parsed dates; bail with 400 on garbage input rather than
  // silently dropping the filter.
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json({ error: 'Invalid `since` date' }, { status: 400 })
  }
  if (until && Number.isNaN(until.getTime())) {
    return NextResponse.json({ error: 'Invalid `until` date' }, { status: 400 })
  }

  const rows = await getOpportunitiesForExport({
    tenantId: profile.tenantId,
    since,
    until,
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
      'Content-Disposition': `attachment; filename="third-code-erp-pipeline-export-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
