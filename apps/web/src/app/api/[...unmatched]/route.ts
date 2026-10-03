import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Unmatched API paths must answer like an API, not like a page.
 *
 * Without this, a request to a removed or mistyped endpoint — POST /api/broadcast
 * was the one found in review — fell through to the framework's HTML not-found
 * page. A JSON client that got `<!doctype html>` back could not tell a deleted
 * route from a routing fault, and the response looked like a working page to
 * anything that only checks the content type.
 *
 * The body uses the same discriminated shape as every other API surface
 * (`{ ok: false, error: { code, message } }`) and deliberately says nothing
 * about which routes do exist.
 */
const NOT_FOUND_BODY = {
  ok: false,
  error: {
    code: 'NOT_FOUND',
    message: 'No API route matches this path and method.',
  },
} as const

function notFound(): NextResponse {
  return NextResponse.json(NOT_FOUND_BODY, {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
  })
}

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
export const HEAD = notFound
export const OPTIONS = notFound
