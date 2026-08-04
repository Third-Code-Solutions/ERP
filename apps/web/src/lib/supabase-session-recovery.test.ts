import { describe, expect, it } from 'vitest'
import {
  isInvalidRefreshTokenError,
  isSupabaseAuthCookieName,
} from './supabase-session-recovery'

describe('Supabase session recovery boundary', () => {
  it('recognizes the provider refresh-token failure shape', () => {
    expect(
      isInvalidRefreshTokenError({
        __isAuthError: true,
        code: 'refresh_token_not_found',
        message: 'Invalid Refresh Token: Refresh Token Not Found',
        status: 400,
      })
    ).toBe(true)
    expect(
      isInvalidRefreshTokenError({
        message: 'Invalid Refresh Token: Refresh Token Not Found',
      })
    ).toBe(true)
  })

  it('does not swallow unrelated auth or runtime failures', () => {
    expect(isInvalidRefreshTokenError(new Error('network down'))).toBe(false)
    expect(isInvalidRefreshTokenError({ code: 'user_not_found' })).toBe(false)
    expect(isInvalidRefreshTokenError(null)).toBe(false)
  })

  it('matches Supabase auth cookie chunks only', () => {
    expect(isSupabaseAuthCookieName('sb-example-auth-token')).toBe(true)
    expect(isSupabaseAuthCookieName('sb-example-auth-token.0')).toBe(true)
    expect(isSupabaseAuthCookieName('sb-example-auth-token.12')).toBe(true)
    expect(isSupabaseAuthCookieName('sb-example-auth-token-old')).toBe(false)
    expect(isSupabaseAuthCookieName('analytics')).toBe(false)
  })
})
