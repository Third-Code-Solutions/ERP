import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Collector for Content-Security-Policy violation reports.
 *
 * Browsers post these without credentials, so the endpoint must stay
 * anonymous; it is deliberately not part of PROTECTED_ROUTE_PREFIXES. The
 * payload is untrusted and attacker-influenced, so the body is size-capped
 * and only a known set of fields is kept — nothing from the report is echoed
 * back or used to build a response.
 */
const MAX_REPORT_BYTES = 8_192

const REPORT_FIELDS = [
  'document-uri',
  'violated-directive',
  'effective-directive',
  'blocked-uri',
  'source-file',
  'line-number',
  'column-number',
  'status-code',
  'disposition',
] as const

const FIELD_MAX_LENGTH = 512

type ViolationReport = Record<string, string>

function extractViolationReport(body: unknown): ViolationReport | null {
  if (typeof body !== 'object' || body === null) return null

  const container = body as Record<string, unknown>
  const nested = container['csp-report'] ?? container.body
  if (typeof nested !== 'object' || nested === null) return null

  const source = nested as Record<string, unknown>
  const report: ViolationReport = {}
  for (const field of REPORT_FIELDS) {
    const value = source[field]
    if (typeof value === 'string') report[field] = value.slice(0, FIELD_MAX_LENGTH)
  }

  return Object.keys(report).length > 0 ? report : null
}

export async function POST(request: Request): Promise<NextResponse> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_REPORT_BYTES) {
    return new NextResponse(null, { status: 413 })
  }

  let body: unknown
  try {
    const raw = await request.text()
    if (raw.length > MAX_REPORT_BYTES) {
      return new NextResponse(null, { status: 413 })
    }
    body = JSON.parse(raw)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  const report = extractViolationReport(body)
  if (report) {
    console.error(
      JSON.stringify({
        action: 'csp.violation',
        outcome: 'blocked',
        ...report,
      })
    )
  }

  // 204: browsers discard the response body and we never reflect the payload.
  return new NextResponse(null, { status: 204 })
}
