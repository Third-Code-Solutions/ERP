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

const HOSTED_CONNECT_SRC =
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.inngest.com https://api.openai.com https://vitals.vercel-insights.com"

function connectSrc(csp: string): string {
  const directive = csp
    .split('; ')
    .find((candidate) => candidate.startsWith('connect-src '))
  if (!directive) throw new Error('CSP is missing connect-src')
  return directive
}

describe('middleware Supabase session recovery', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ERP_DISTRIBUTED_RATE_LIMIT_ENABLED', 'false')
    vi.stubEnv('ERP_E2E_LOCAL_CSP', '')
    vi.stubEnv('ERP_E2E_SUPABASE_ORIGIN', '')
    vi.stubEnv('VERCEL', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '')
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

  it.each([80, 55321, 65535])(
    'adds only the exact configured disposable loopback HTTP and WebSocket sources for port %i',
    async (port) => {
      vi.stubEnv('ERP_E2E_LOCAL_CSP', '1')
      vi.stubEnv('ERP_E2E_SUPABASE_ORIGIN', `http://127.0.0.1:${port}`)
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

      const response = await middleware(
        new NextRequest('http://127.0.0.1:3000/auth/login')
      )
      const csp = response.headers.get('content-security-policy') ?? ''

      expect(connectSrc(csp)).toBe(
        `${HOSTED_CONNECT_SRC} http://127.0.0.1:${port} ws://127.0.0.1:${port}`
      )
    }
  )

  it.each([
    ['missing gate', '', 'http://127.0.0.1:55321'],
    ['missing origin', '1', ''],
    ['https scheme', '1', 'https://127.0.0.1:55321'],
    ['localhost DNS', '1', 'http://localhost:55321'],
    ['IPv6 loopback', '1', 'http://[::1]:55321'],
    ['remote host', '1', 'http://192.0.2.10:55321'],
    ['credentialed authority', '1', 'http://user@127.0.0.1:55321'],
    ['path', '1', 'http://127.0.0.1:55321/realtime'],
    ['query', '1', 'http://127.0.0.1:55321?channel=role-matrix'],
    ['fragment', '1', 'http://127.0.0.1:55321#realtime'],
    ['wildcard', '1', 'http://*.localhost:55321'],
    ['missing port', '1', 'http://127.0.0.1'],
    ['port zero', '1', 'http://127.0.0.1:0'],
    ['port out of range', '1', 'http://127.0.0.1:65536'],
  ])('fails closed for a %s local E2E CSP configuration', async (_label, gate, origin) => {
    vi.stubEnv('ERP_E2E_LOCAL_CSP', gate)
    vi.stubEnv('ERP_E2E_SUPABASE_ORIGIN', origin)
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await middleware(
      new NextRequest('http://127.0.0.1:3000/auth/login')
    )

    expect(connectSrc(response.headers.get('content-security-policy') ?? '')).toBe(HOSTED_CONNECT_SRC)
  })

  it.each([
    ['VERCEL', '1'],
    ['VERCEL_ENV', 'production'],
    ['VERCEL_ENV', 'preview'],
    ['VERCEL_URL', 'erp.example.vercel.app'],
    ['VERCEL_DEPLOYMENT_ID', 'dpl_example'],
  ])('does not augment hosted CSP when %s is configured', async (name, value) => {
    vi.stubEnv('ERP_E2E_LOCAL_CSP', '1')
    vi.stubEnv('ERP_E2E_SUPABASE_ORIGIN', 'http://127.0.0.1:55321')
    vi.stubEnv(name, value)
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await middleware(
      new NextRequest('https://erp.example/auth/login')
    )

    expect(connectSrc(response.headers.get('content-security-policy') ?? '')).toBe(HOSTED_CONNECT_SRC)
  })

  it('does not treat NEXT_PUBLIC_SUPABASE_URL as CSP authority', async () => {
    vi.stubEnv('ERP_E2E_LOCAL_CSP', '1')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55321')
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await middleware(
      new NextRequest('http://127.0.0.1:3000/auth/login')
    )

    expect(connectSrc(response.headers.get('content-security-policy') ?? '')).toBe(HOSTED_CONNECT_SRC)
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
