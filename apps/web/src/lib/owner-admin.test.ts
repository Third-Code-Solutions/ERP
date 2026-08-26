import { describe, expect, it } from 'vitest'
import { isOwnerAdminEmail, isOwnerAdminUser } from './owner-admin'

describe('owner admin boundary', () => {
  it('allows only the normalized Kurt owner email', () => {
    expect(isOwnerAdminEmail('kurt@thirdcodesolutions.com')).toBe(true)
    expect(isOwnerAdminEmail('  KURT@THIRDCODESOLUTIONS.COM ')).toBe(true)
    expect(isOwnerAdminEmail('kurt+ops@thirdcodesolutions.com')).toBe(false)
    expect(isOwnerAdminEmail('owner@thirdcodesolutions.com')).toBe(false)
    expect(isOwnerAdminEmail(null)).toBe(false)
  })

  it('requires a confirmed identity as well as the allowlisted address', () => {
    expect(
      isOwnerAdminUser({
        email: 'kurt@thirdcodesolutions.com',
        email_confirmed_at: '2026-08-25T00:00:00.000Z',
        confirmed_at: undefined,
      })
    ).toBe(true)
    expect(
      isOwnerAdminUser({
        email: 'kurt@thirdcodesolutions.com',
        email_confirmed_at: undefined,
        confirmed_at: undefined,
      })
    ).toBe(false)
  })
})
