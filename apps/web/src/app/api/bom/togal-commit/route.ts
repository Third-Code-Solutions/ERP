import { NextRequest, NextResponse } from 'next/server'

/**
 * The legacy Togal commit endpoint is intentionally closed. Its former
 * contract accepted caller-supplied prices and bypassed takeoff identity,
 * unresolved rows, and DUPA provenance.
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'LEGACY_ENDPOINT_DEPRECATED',
        message: 'Use /api/bom/takeoff-import with source="togal" and commit only validated unpriced rows.',
      },
    },
    {
      status: 410,
      headers: {
        Deprecation: 'true',
        Link: '</api/bom/takeoff-import>; rel="successor-version"',
      },
    },
  )
}
