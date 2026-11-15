import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(() => ({})),
  createBrowserClient: vi.fn(() => ({})),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mocks.createServerClient,
  createBrowserClient: mocks.createBrowserClient,
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}))

import { createSupabaseBrowserClient } from '@third-code-erp/auth/client'
import { supabaseAuthCookieOptions } from '@third-code-erp/auth/cookie-options'
import { createSupabaseServerClient } from '@third-code-erp/auth/server'

const SECURE = { path: '/', sameSite: 'lax', secure: true }

describe('Supabase auth cookie options (SEC-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('marks the auth cookies Secure in production only', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(supabaseAuthCookieOptions()).toEqual(SECURE)
    vi.stubEnv('NODE_ENV', 'development')
    expect(supabaseAuthCookieOptions()).toEqual({ ...SECURE, secure: false })
  })

  it('passes them to the package server and browser clients', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    await createSupabaseServerClient()
    createSupabaseBrowserClient()

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({ cookieOptions: SECURE })
    )
    expect(mocks.createBrowserClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key', {
      cookieOptions: SECURE,
    })
  })
})
