import { describe, expect, it } from 'vitest'
import { isRecentAuthentication, verifiedAuthenticationTime } from './verified-authentication'

const userId = '11111111-1111-4111-8111-111111111111'
const token = (payload: object) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`

describe('provider-verified authentication evidence', () => {
  it('uses interactive AMR, not refresh issuance or recovery', () => {
    expect(verifiedAuthenticationTime(token({ sub: userId, iat: 5000, amr: [
      { method: 'password', timestamp: 1000 },
      { method: 'token_refresh', timestamp: 5000 },
      { method: 'recovery', timestamp: 6000 },
    ] }), userId)).toBe(1000)
  })
  it('accepts later MFA authentication evidence', () => {
    expect(verifiedAuthenticationTime(token({ sub: userId, amr: [
      { method: 'password', timestamp: 1000 }, { method: 'totp', timestamp: 2000 },
    ] }), userId)).toBe(2000)
  })
  it.each(['broken', token({ sub: userId }), token({ sub: 'other', amr: [] }),
    token({ sub: userId, amr: [{ method: 'password', timestamp: '1000' }] }),
    token({ sub: userId, amr: [{ method: 'token_refresh', timestamp: 1000 }] }),
  ])('fails closed for missing or invalid authentication evidence', (jwt) => {
    expect(verifiedAuthenticationTime(jwt, userId)).toBeUndefined()
  })
  it('rejects stale, future, absent and non-finite timestamps', () => {
    expect(isRecentAuthentication(1000, 1900000)).toBe(true)
    expect(isRecentAuthentication(1000, 1901000)).toBe(false)
    expect(isRecentAuthentication(2000, 1900000)).toBe(false)
    expect(isRecentAuthentication(undefined)).toBe(false)
    expect(isRecentAuthentication(NaN)).toBe(false)
  })
})
