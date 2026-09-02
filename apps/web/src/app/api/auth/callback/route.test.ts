import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getClaims: vi.fn(),
  cookieStore: {
    getAll: vi.fn(() => []),
    set: vi.fn(),
  },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
}))

import { resolveAuthCallbackPath } from './redirect'
import { GET } from './route'

describe('auth callback redirect safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    mocks.createServerClient.mockReturnValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        getClaims: mocks.getClaims,
      },
    })
  })

  it('allows only the exact callback destinations used by the app', () => {
    expect(resolveAuthCallbackPath('/dashboard')).toBe('/dashboard')
    expect(resolveAuthCallbackPath('/auth/update-password')).toBe(
      '/auth/update-password'
    )

    for (const unsafe of [
      'https://evil.example/phish',
      '//evil.example/phish',
      '/auth/update-password/../login',
      '/auth/update-password?next=https://evil.example',
      '\\evil.example\phish',
    ]) {
      expect(resolveAuthCallbackPath(unsafe), unsafe).toBe('/dashboard')
    }
  })

  it('exchanges a valid recovery code and redirects on the same origin', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const sessionId = '22222222-2222-4222-8222-222222222222'
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: userId, recovery_sent_at: new Date().toISOString() },
        session: { access_token: 'test-recovery-access-token' },
        redirectType: 'recovery',
      },
      error: null,
    })
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, session_id: sessionId } },
      error: null,
    })

    const response = await GET(
      new NextRequest(
        'https://erp.example/api/auth/callback?code=recovery-code&next=%2Fauth%2Fupdate-password'
      )
    )

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('recovery-code')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://erp.example/auth/update-password'
    )
    expect(response.cookies.get('abi-ops-password-recovery')?.value).toMatch(
      /^[a-f0-9]{64}$/
    )
  })

  it('does not mark an ordinary code exchange as password recovery', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const sessionId = '22222222-2222-4222-8222-222222222222'
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: userId, recovery_sent_at: new Date().toISOString() },
        session: { access_token: 'test-ordinary-access-token' },
        redirectType: 'signup',
      },
      error: null,
    })
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: userId, session_id: sessionId } },
      error: null,
    })

    const response = await GET(
      new NextRequest(
        'https://erp.example/api/auth/callback?code=ordinary-code&next=%2Fauth%2Fupdate-password'
      )
    )

    expect(response.headers.get('location')).toBe('https://erp.example/dashboard')
    expect(mocks.getClaims).not.toHaveBeenCalled()
    expect(response.cookies.get('abi-ops-password-recovery')).toBeUndefined()
  })

  it('falls back to the dashboard instead of following an external next URL', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: '11111111-1111-4111-8111-111111111111' },
        session: { access_token: 'test-access-token' },
      },
      error: null,
    })

    const response = await GET(
      new NextRequest(
        'https://erp.example/api/auth/callback?code=valid&next=https%3A%2F%2Fevil.example%2Fphish'
      )
    )

    expect(response.headers.get('location')).toBe('https://erp.example/dashboard')
    expect(response.cookies.get('abi-ops-password-recovery')).toBeUndefined()
  })

  it('returns a same-origin failure redirect when code exchange fails', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'expired code' },
    })

    const response = await GET(
      new NextRequest(
        'https://erp.example/api/auth/callback?code=expired&next=%2Fauth%2Fupdate-password'
      )
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://erp.example/auth/login?error=auth_callback_failed'
    )
    expect(response.cookies.get('abi-ops-password-recovery')).toBeUndefined()
  })
})
