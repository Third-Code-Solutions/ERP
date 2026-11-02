import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  getClaims: vi.fn(),
  rpc: vi.fn(),
  createServerClient: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}))

import { middleware } from './middleware'
import { createRecoveryMarker } from './lib/auth-recovery-binding'

describe('middleware Supabase session recovery', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ERP_DISTRIBUTED_RATE_LIMIT_ENABLED', 'false')
    vi.stubEnv('ERP_CORE_API_URL', '')
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://example.supabase.co'
    )
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: mocks.getUser,
        getSession: mocks.getSession,
        getClaims: mocks.getClaims,
      },
      rpc: mocks.rpc,
    })
  })

  it('clears stale auth cookies and redirects protected routes normally', async () => {
    mocks.getUser.mockRejectedValue({
      __isAuthError: true,
      code: 'refresh_token_not_found',
      message: 'Invalid Refresh Token: Refresh Token Not Found',
      status: 400,
    })
    const request = new NextRequest('https://erp.example/dashboard', {
      headers: {
        cookie:
          'sb-example-auth-token=stale; sb-example-auth-token.0=chunk; analytics=keep',
      },
    })

    const response = await middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://erp.example/auth/login'
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    )
    const setCookies = response.headers.getSetCookie()
    const staleCookies = setCookies.filter((cookie) =>
      cookie.startsWith('sb-example-auth-token')
    )
    expect(staleCookies).toHaveLength(2)
    expect(
      staleCookies.every((cookie) =>
        cookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
      )
    ).toBe(true)
    expect(setCookies.some((cookie) => cookie.startsWith('analytics'))).toBe(
      false
    )
  })

  it('protects profile settings and the password recovery form from anonymous requests', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    for (const path of ['/settings/profile', '/auth/update-password']) {
      const response = await middleware(
        new NextRequest(`https://erp.example${path}`)
      )

      expect(response.status, path).toBe(307)
      expect(response.headers.get('location'), path).toBe(
        'https://erp.example/auth/login'
      )
    }
  })

  it('allows only callback-marked authenticated recovery sessions on the update page', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const sessionId = '22222222-2222-4222-8222-222222222222'
    const accessToken = 'test-recovery-access-token'
    const recoverySentAt = new Date().toISOString()
    mocks.getUser.mockResolvedValue({
      data: { user: { id: userId, recovery_sent_at: recoverySentAt } },
      error: null,
    })
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: accessToken } },
      error: null,
    })
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, session_id: sessionId } },
      error: null,
    })
    const marker = await createRecoveryMarker({
      userId,
      sessionId,
      accessToken,
      recoverySentAt,
    })
    expect(marker).not.toBeNull()

    const markedResponse = await middleware(
      new NextRequest('https://erp.example/auth/update-password', {
        headers: { cookie: `abi-ops-password-recovery=${marker}` },
      })
    )
    expect(markedResponse.status).toBe(200)

    const fabricatedMarkerResponse = await middleware(
      new NextRequest('https://erp.example/auth/update-password', {
        headers: { cookie: `abi-ops-password-recovery=${'a'.repeat(64)}` },
      })
    )
    expect(fabricatedMarkerResponse.status).toBe(307)
    expect(fabricatedMarkerResponse.headers.get('location')).toBe(
      'https://erp.example/settings/profile'
    )
  })

  it('denies an ordinary authenticated session even with a fabricated marker', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: '11111111-1111-4111-8111-111111111111' },
      },
      error: null,
    })

    const response = await middleware(
      new NextRequest('https://erp.example/auth/update-password', {
        headers: { cookie: `abi-ops-password-recovery=${'b'.repeat(64)}` },
      })
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://erp.example/settings/profile'
    )
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.getClaims).not.toHaveBeenCalled()
  })

  it('still surfaces unrelated provider failures', async () => {
    mocks.getUser.mockRejectedValue(new Error('supabase unavailable'))
    const request = new NextRequest('https://erp.example/dashboard')

    await expect(middleware(request)).rejects.toThrow('supabase unavailable')
  })

  it('denies tenant roles at the platform boundary before rendering', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null })
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'tenant-owner@example.test',
          email_confirmed_at: '2026-09-04T00:00:00.000Z',
        },
      },
      error: null,
    })

    const response = await middleware(
      new NextRequest('https://erp.example/platform-admin')
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('is_platform_owner')
  })

  it('requires the database owner decision for the exact verified identity', async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'owner@independent.example.invalid',
          email_confirmed_at: '2026-09-04T00:00:00.000Z',
        },
      },
      error: null,
    })
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null })
    const denied = await middleware(
      new NextRequest('https://erp.example/platform-admin/tenants')
    )
    expect(denied.status).toBe(403)

    mocks.rpc.mockResolvedValueOnce({ data: true, error: null })
    const allowed = await middleware(
      new NextRequest('https://erp.example/platform-admin/tenants')
    )
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('cache-control')).toContain('no-store')
  })

  it('denies unverified identities before checking the platform assignment', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'owner@independent.example.invalid', email_confirmed_at: null } },
      error: null,
    })
    const response = await middleware(new NextRequest('https://erp.example/platform-admin'))
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('fails closed when the platform assignment provider is unavailable', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'owner@independent.example.invalid', email_confirmed_at: '2026-10-11T00:00:00.000Z' } },
      error: null,
    })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Unavailable' } })
    const response = await middleware(new NextRequest('https://erp.example/platform-admin'))
    expect(response.status).toBe(503)
  })

  it('allows only loopback Supabase HTTP and WebSocket origins in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:4328')
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const request = new NextRequest('http://127.0.0.1:4327/auth/login')

    const response = await middleware(request)
    const csp = response.headers.get('content-security-policy') ?? ''

    expect(csp).toContain('http://127.0.0.1:4328')
    expect(csp).toContain('ws://127.0.0.1:4328')
  })

  it('does not add loopback sources to the production CSP', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:4328')
    vi.stubEnv('ERP_CORE_API_URL', 'http://127.0.0.1:3091')
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const request = new NextRequest('https://erp.example/auth/login')

    const response = await middleware(request)
    const csp = response.headers.get('content-security-policy') ?? ''

    expect(csp).not.toContain('http://127.0.0.1:4328')
    expect(csp).not.toContain('ws://127.0.0.1:4328')
    expect(csp).not.toContain('http://127.0.0.1:3091')
  })

  async function connectSources() {
    const response = await middleware(new NextRequest('https://erp.example/api/health'))
    return response.headers.get('content-security-policy')?.split('; ').find(directive => directive.startsWith('connect-src '))
  }

  it('adds only the exact configured HTTPS Core origin for direct uploads', async () => {
    const baseline = await connectSources()
    vi.stubEnv('ERP_CORE_API_URL', 'https://core.example:8443/base/path?query=value#fragment')
    expect(await connectSources()).toBe(`${baseline} https://core.example:8443`)
  })

  it.each([
    '', 'not-a-url', 'http://core.example', 'http://localhost:3091',
    'https://127.0.0.1:3091', 'ftp://core.example', 'file:///tmp/core',
    'javascript:alert(1)', 'https://user:password@core.example',
    'https://*.core.example', 'https://core.example;connect-src',
    'https://core.example; connect-src *',
  ])('does not widen production connections for missing or unsafe Core URL %s', async (url) => {
    const baseline = await connectSources()
    vi.stubEnv('ERP_CORE_API_URL', url)
    expect(await connectSources()).toBe(baseline)
  })

  it.each(['localhost', '127.0.0.1', '[::1]'])('allows configured HTTP Core on %s only in development', async (host) => {
    vi.stubEnv('NODE_ENV', 'development')
    const baseline = await connectSources()
    vi.stubEnv('ERP_CORE_API_URL', `http://${host}:3091`)
    expect(await connectSources()).toBe(`${baseline} http://${host}:3091`)
    vi.stubEnv('NODE_ENV', 'production')
    expect(await connectSources()).toBe(baseline)
  })

  it('rejects non-loopback HTTP Core even in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const baseline = await connectSources()
    vi.stubEnv('ERP_CORE_API_URL', 'http://core.example')
    expect(await connectSources()).toBe(baseline)
  })

  it('fails closed when distributed rate limiting is selected without complete credentials', async () => {
    vi.stubEnv('ERP_DISTRIBUTED_RATE_LIMIT_ENABLED', 'true')
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const request = new NextRequest('https://erp.example/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.31' },
    })

    const response = await middleware(request)

    expect(response.status).toBe(503)
    expect(Object.fromEntries(response.headers.entries())).toMatchObject({
      'ratelimit-scope': 'general',
      'x-content-type-options': 'nosniff',
    })
  })

  it('uses the configured distributed limiter instead of a process-local counter', async () => {
    vi.stubEnv('ERP_DISTRIBUTED_RATE_LIMIT_ENABLED', 'true')
    vi.stubEnv(
      'UPSTASH_REDIS_REST_URL',
      'https://example-rate-limit.upstash.io'
    )
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    vi.stubEnv('ERP_RATE_LIMIT_KEY_SALT', 'unit-test-salt-not-a-secret-00000000')
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ result: [1, 60_000] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const request = new NextRequest('https://erp.example/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.32' },
    })

    const response = await middleware(request)

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://example-rate-limit.upstash.io'
    )
  })
})
