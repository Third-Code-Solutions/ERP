import { describe, expect, it } from 'vitest'
import { kycArtifactCreateCommandSchema, accountKycDocumentQuerySchema } from '../erp-api/kyc-artifacts'

describe('KYC artifact contracts', () => {
  const id = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
  it('normalizes retry payload and preserves metadata-only entry', () => {
    expect(kycArtifactCreateCommandSchema.parse({ clientRequestId: id, artifactType: 'other', notes: '  ' })).toEqual({ clientRequestId: id.toLowerCase(), artifactType: 'other', notes: null, documentId: null })
  })
  it('rejects authority injection and overlong notes', () => {
    expect(kycArtifactCreateCommandSchema.safeParse({ clientRequestId: id, artifactType: 'other', tenantId: id }).success).toBe(false)
    expect(kycArtifactCreateCommandSchema.safeParse({ clientRequestId: id, artifactType: 'other', notes: 'x'.repeat(2001) }).success).toBe(false)
  })
  it('bounds search and pagination and rejects unknown query keys', () => {
    expect(accountKycDocumentQuerySchema.parse({})).toEqual({ q: '', page: 1, limit: 20 })
    for (const input of [{ limit: 51 }, { page: 0 }, { q: 'x'.repeat(201) }, { tenantId: id }]) expect(accountKycDocumentQuerySchema.safeParse(input).success).toBe(false)
  })
})
