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
import {
  SESSION_CHOICE_COOKIE,
  SESSION_LIVE_COOKIE,
} from './lib/session-persistence'

const AUTH_COOKIE = 'sb-example-auth-token'

function authenticatedRequest(cookie: string, path = '/dashboard') {
  return new NextRequest(`https://erp.example${path}`, {
    headers: { cookie, 'x-forwarded-for': '203.0.113.44' },
  })
}

describe('middleware "keep me signed in" enforcement', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ERP_DISTRIBUTED_RATE_LIMIT_ENABLED', 'false')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    mocks.createServerClient.mockReturnValue({
      auth: {
        getUser: mocks.getUser,
        getSession: mocks.getSession,
        getClaims: mocks.getClaims,
      },
      rpc: mocks.rpc,
    })
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'person@example.com',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
          recovery_sent_at: null,
        },
      },
      error: null,
    })
  })

  it('signs out a session the user chose not to remember once the browser cookie is gone', async () => {
    const response = await middleware(
      authenticatedRequest(`${AUTH_COOKIE}=token; ${SESSION_CHOICE_COOKIE}=session`)
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://erp.example/auth/login'
    )
    const setCookies = response.headers.getSetCookie()
    expect(setCookies.some((cookie) => cookie.startsWith(AUTH_COOKIE))).toBe(true)
    expect(
      setCookies.some((cookie) => cookie.startsWith(SESSION_CHOICE_COOKIE))
    ).toBe(true)
  })

  it('keeps the session while the browser that signed in is still open', async () => {
    const response = await middleware(
      authenticatedRequest(
        `${AUTH_COOKIE}=token; ${SESSION_CHOICE_COOKIE}=session; ${SESSION_LIVE_COOKIE}=1`
      )
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('signs out a remembered session past its seventh day', async () => {
    const expired = `remember.${Date.now() - 1_000}`
    const response = await middleware(
      authenticatedRequest(
        `${AUTH_COOKIE}=token; ${SESSION_CHOICE_COOKIE}=${expired}; ${SESSION_LIVE_COOKIE}=1`
      )
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://erp.example/auth/login'
    )
  })

  it('leaves sessions established by other flows alone', async () => {
    // Magic-link, invitation and password-recovery sessions never write the
    // record, so enforcement must not touch them.
    const response = await middleware(
      authenticatedRequest(`${AUTH_COOKIE}=token`)
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })
})
