import { jsonResponse } from './cors.ts'

// These scheduler functions run with the service role across every tenant, and
// the gateway accepts the public anon key, so a caller must also present
// CRON_SECRET. Fails closed when the secret is not configured.
export const CRON_SECRET_HEADER = 'x-cron-secret'

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
  return diff === 0
}

export function rejectUnlessCronCaller(
  req: Request,
  secret: string | undefined = Deno.env.get('CRON_SECRET'),
): Response | null {
  if (!secret) {
    return jsonResponse({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  const presented = req.headers.get(CRON_SECRET_HEADER) ?? ''
  if (!constantTimeEqual(presented, secret)) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
