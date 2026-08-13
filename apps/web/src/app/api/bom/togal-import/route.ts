import { NextRequest, NextResponse } from 'next/server'

/**
 * Togal was the first producer-specific importer. It is retired in favor of
 * the validated generic takeoff contract so no legacy caller can create a
 * priced line outside the DUPA workflow.
 */
export async function POST(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'LEGACY_ENDPOINT_DEPRECATED',
        message: 'Use /api/bom/takeoff-import with source="togal" and an explicit column mapping.',
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
