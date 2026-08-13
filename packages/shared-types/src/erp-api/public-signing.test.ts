import { describe, expect, it } from 'vitest'
import {
  publicSigningBodySchema,
  publicSigningCommandSchema,
  publicSigningResultSchema,
} from './public-signing'

const TOKEN = 'a'.repeat(64)
const BODY = {
  signerName: ' Ana Reyes ',
  signerEmail: ' ana@example.com ',
  signatureDataUrl: 'data:image/png;base64,abc=',
}

describe('public signing contracts', () => {
  it('normalizes signer fields and keeps the token out of the body contract', () => {
    expect(publicSigningBodySchema.parse(BODY)).toEqual({
      signerName: 'Ana Reyes',
      signerEmail: 'ana@example.com',
      signatureDataUrl: BODY.signatureDataUrl,
    })
    expect(publicSigningBodySchema.safeParse({ ...BODY, token: TOKEN }).success).toBe(false)
  })

  it('accepts only a 64-character hex token in the command', () => {
    expect(publicSigningCommandSchema.safeParse({ token: TOKEN, ...BODY }).success).toBe(true)
    expect(publicSigningCommandSchema.safeParse({ token: 'short', ...BODY }).success).toBe(false)
  })

  it('requires a typed tenant-scoped signature result', () => {
    const result = publicSigningResultSchema.parse({
      sessionId: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      entityType: 'contract',
      entityId: '33333333-3333-4333-8333-333333333333',
      signatureDocumentId: '44444444-4444-4444-8444-444444444444',
      signedAt: '2026-08-03T00:00:00.000Z',
    })
    expect(result.entityType).toBe('contract')
  })
})
