// Shared CORS headers for Supabase Edge Functions.
//
// Schedulers are usually called by pg_cron via `net.http_post` (server-to-
// server, no preflight) but we still attach CORS so the same endpoints can
// be hit from the dashboard for manual "run now" buttons during dev.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {}
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}
