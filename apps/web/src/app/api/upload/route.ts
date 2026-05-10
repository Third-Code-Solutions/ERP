import { NextResponse } from 'next/server'

// The old multipart-body upload endpoint is retired. Files now upload directly
// to Supabase Storage via a signed URL — see /api/upload/sign and
// /api/upload/complete. This route exists only to surface a clear error if a
// stale browser tab still references it.
export async function POST() {
  return NextResponse.json(
    {
      error:
        'This endpoint is retired. Use /api/upload/sign + direct Supabase upload + /api/upload/complete.',
    },
    { status: 410 }
  )
}
