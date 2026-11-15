import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServerClient } from '@supabase/ssr'

// SEC-14 relies on @supabase/ssr merging the caller's `cookieOptions` into
// every auth cookie it writes or removes. This pins that contract against the
// real library, so an upgrade that stops merging them fails here.

const SUPABASE_URL = 'https://example.supabase.co'
const AUTH_COOKIE = 'sb-example-auth-token'

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function unsignedJwt(sub: string): string {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({
    sub,
    exp,
    aud: 'authenticated',
    role: 'authenticated',
  })}.c2lnbmF0dXJl`
}

describe('@supabase/ssr cookieOptions contract (SEC-14)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies secure, path and sameSite to session writes and stale-chunk removals', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ id: userId, aud: 'authenticated', role: 'authenticated' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    )
    const writes: { name: string; value: string; options?: Record<string, unknown> }[] = []
    const client = createServerClient(SUPABASE_URL, 'anon-key', {
      cookieOptions: { path: '/', sameSite: 'lax', secure: true },
      cookies: {
        getAll: () => [
          { name: `${AUTH_COOKIE}.0`, value: 'stale' },
          { name: `${AUTH_COOKIE}.1`, value: 'stale' },
        ],
        setAll: (cookies: typeof writes) => {
          writes.push(...cookies)
        },
      },
    })

    const { error } = await client.auth.setSession({
      access_token: unsignedJwt(userId),
      refresh_token: 'refresh-token',
    })
    await vi.waitFor(() => expect(writes.length).toBeGreaterThan(0))

    expect(error).toBeNull()
    const sessionWrite = writes.find((cookie) => cookie.name === AUTH_COOKIE)
    expect(sessionWrite?.options).toMatchObject({ path: '/', sameSite: 'lax', secure: true })
    const removals = writes.filter((cookie) => cookie.options?.maxAge === 0)
    expect(removals.map((cookie) => cookie.name).sort()).toEqual([
      `${AUTH_COOKIE}.0`,
      `${AUTH_COOKIE}.1`,
    ])
    for (const removal of removals) {
      expect(removal.options).toMatchObject({ path: '/', sameSite: 'lax', secure: true })
    }
  })
})
