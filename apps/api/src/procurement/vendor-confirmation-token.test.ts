import { describe, expect, it } from 'vitest'
import {
  deriveVendorConfirmationToken,
  hashVendorConfirmationToken,
} from './vendor-confirmation-token'

const SECRET = 's'.repeat(32)
const TENANT = '22222222-2222-4222-8222-222222222222'
const SESSION = '33333333-3333-4333-8333-333333333333'

describe('vendor confirmation token derivation', () => {
  it('is deterministic, tenant-scoped, and fixed-length', () => {
    const token = deriveVendorConfirmationToken(SECRET, TENANT, SESSION)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(deriveVendorConfirmationToken(SECRET, TENANT, SESSION)).toBe(token)
    expect(
      deriveVendorConfirmationToken(SECRET, '44444444-4444-4444-8444-444444444444', SESSION)
    ).not.toBe(token)
    expect(
      deriveVendorConfirmationToken(SECRET, TENANT, '55555555-5555-4555-8555-555555555555')
    ).not.toBe(token)
  })

  it('stores only a one-way hash of the derived token', () => {
    const token = deriveVendorConfirmationToken(SECRET, TENANT, SESSION)
    expect(hashVendorConfirmationToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashVendorConfirmationToken(token)).not.toBe(token)
  })
})
