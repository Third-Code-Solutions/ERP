import { NextResponse, type NextRequest } from 'next/server'
import { can, getUserProfile } from '@third-code-erp/auth'

import {
  getOpportunityExportRows,
  OPPORTUNITY_EXPORT_HEADERS,
  OPPORTUNITY_EXPORT_MAX_ROWS,
  opportunityExportCsvLine,
  parseOpportunityExportFilters,
} from './opportunity-export'

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
  'X-Content-Type-Options': 'nosniff',
} as const

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: RESPONSE_HEADERS },
  )
}

export async function GET(req: NextRequest): Promise<Response> {
  let profile: Awaited<ReturnType<typeof getUserProfile>>
  try {
    profile = await getUserProfile()
  } catch {
    return jsonError('Export unavailable', 500)
  }

  if (!profile) return jsonError('Unauthorized', 401)
  if (!can(profile.role, 'opportunity.export')) {
    return jsonError('Forbidden', 403)
  }

  const parsed = parseOpportunityExportFilters(req.nextUrl.searchParams)
  if (!parsed.success) return jsonError('Invalid export filters', 400)

  let rows: Awaited<ReturnType<typeof getOpportunityExportRows>>
  try {
    rows = await getOpportunityExportRows(profile.tenantId, parsed.data)
  } catch {
    return jsonError('Export unavailable', 500)
  }

  if (rows.length > OPPORTUNITY_EXPORT_MAX_ROWS) {
    return jsonError(
      'Export exceeds the 10,000-row limit. Narrow the filters and try again.',
      413,
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`${OPPORTUNITY_EXPORT_HEADERS.join(',')}\r\n`),
      )
      for (const row of rows) {
        controller.enqueue(
          encoder.encode(`${opportunityExportCsvLine(row)}\r\n`),
        )
      }
      controller.close()
    },
  })

  const today = new Date().toISOString().slice(0, 10)
  return new Response(stream, {
    status: 200,
    headers: {
      ...RESPONSE_HEADERS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="abi-ops-pipeline-export-${today}.csv"`,
    },
  })
}
