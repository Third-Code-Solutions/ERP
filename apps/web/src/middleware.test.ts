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
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
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
})
