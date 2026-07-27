// Email helper for Supabase Edge Functions.
//
// Uses Resend's HTTP API directly — no SDK dep so cold-starts stay tiny.
// If RESEND_API_KEY is unset (typical for local dev) we log + return so
// the rest of the scheduler still runs.

interface SendEmailArgs {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
}

interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
  skipped?: boolean
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    // Soft-fail: dev environments do not have email creds.
    // eslint-disable-next-line no-console
    console.warn('[edge-fn] RESEND_API_KEY missing — skipping email', {
      to: args.to,
      subject: args.subject,
    })
    return { ok: true, skipped: true }
  }

  const from = args.from ?? Deno.env.get('RESEND_FROM_EMAIL')
  if (!from) {
    return { ok: false, error: 'RESEND_FROM_EMAIL is not configured' }
  }

  const payload: Record<string, unknown> = {
    from,
    to: Array.isArray(args.to) ? args.to : [args.to],
    subject: args.subject,
  }
  if (args.html) payload.html = args.html
  if (args.text) payload.text = args.text
  if (!args.html && !args.text) payload.text = args.subject

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const errBody = await res.text()
      return { ok: false, error: `Resend ${res.status}: ${errBody}` }
    }
    const data = (await res.json()) as { id?: string }
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// -----------------------------------------------------------------------------
// PostgREST helpers — schedulers use these to read/write Supabase Postgres
// directly via the auto-generated REST API. Avoids a supabase-js dep in the
// Deno runtime.
// -----------------------------------------------------------------------------

interface PgRestRequestArgs {
  path: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  prefer?: string
}

export function pgRestUrl(): string {
  const url = Deno.env.get('SUPABASE_URL')
  if (!url) throw new Error('SUPABASE_URL not configured')
  return `${url.replace(/\/$/, '')}/rest/v1`
}

export function serviceRoleKey(): string {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  return key
}

export async function pgRest<T = unknown>(
  args: PgRestRequestArgs
): Promise<T> {
  const key = serviceRoleKey()
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  if (args.prefer) headers.Prefer = args.prefer

  const url = `${pgRestUrl()}/${args.path.replace(/^\//, '')}`
  const res = await fetch(url, {
    method: args.method ?? 'GET',
    headers,
    body: args.body ? JSON.stringify(args.body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PostgREST ${args.method ?? 'GET'} ${args.path} → ${res.status}: ${text}`)
  }

  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    return undefined as unknown as T
  }
  return (await res.json()) as T
}

export async function pgSelect<T = unknown>(
  table: string,
  query: string
): Promise<T[]> {
  return pgRest<T[]>({
    path: `${table}?${query}`,
    method: 'GET',
  })
}

export async function pgUpdate<T = unknown>(
  table: string,
  filter: string,
  patch: Record<string, unknown>
): Promise<T[]> {
  return pgRest<T[]>({
    path: `${table}?${filter}`,
    method: 'PATCH',
    body: patch,
    prefer: 'return=representation',
  })
}

export async function pgInsert<T = unknown>(
  table: string,
  rows: Record<string, unknown> | Record<string, unknown>[]
): Promise<T[]> {
  return pgRest<T[]>({
    path: table,
    method: 'POST',
    body: rows,
    prefer: 'return=representation',
  })
}

// Lookup admin/GM user ids for notification targeting. Used by SLA + permit
// schedulers. Filters by role membership.
export async function fetchUsersByRoles(
  tenantId: string,
  roles: string[]
): Promise<Array<{ id: string; email: string }>> {
  if (roles.length === 0) return []
  const rolesParam = roles.map(encodeURIComponent).join(',')
  return pgSelect<{ id: string; email: string }>(
    'users',
    `tenant_id=eq.${tenantId}&role=in.(${rolesParam})&select=id,email`
  )
}
