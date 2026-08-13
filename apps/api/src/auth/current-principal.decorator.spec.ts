import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { requireCurrentPrincipal, type ErpPrincipal } from './current-principal.decorator'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}

describe('requireCurrentPrincipal', () => {
  it('returns the authenticated principal', () => {
    expect(requireCurrentPrincipal({ principal: PRINCIPAL })).toBe(PRINCIPAL)
  })

  it('returns a typed unauthorized error when guard context is missing', () => {
    expect(() => requireCurrentPrincipal({})).toThrow(UnauthorizedException)
  })
})
