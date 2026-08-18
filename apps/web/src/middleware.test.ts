import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}))

import { middleware } from './middleware'

describe('middleware Supabase session recovery', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ERP_DISTRIBUTED_RATE_LIMIT_ENABLED', 'false')
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://example.supabase.co'
    )
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    mocks.createServerClient.mockReturnValue({
      auth: { getUser: mocks.getUser },
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

  it('still surfaces unrelated provider failures', async () => {
    mocks.getUser.mockRejectedValue(new Error('supabase unavailable'))
    const request = new NextRequest('https://erp.example/dashboard')

    await expect(middleware(request)).rejects.toThrow('supabase unavailable')
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
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const request = new NextRequest('https://erp.example/auth/login')

    const response = await middleware(request)
    const csp = response.headers.get('content-security-policy') ?? ''

    expect(csp).not.toContain('http://127.0.0.1:4328')
    expect(csp).not.toContain('ws://127.0.0.1:4328')
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
