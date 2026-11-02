import { describe, expect, it } from 'vitest'
import {
  companyDocumentIdentity,
  companyMark,
  missingDocumentIdentityFields,
  resolveDocumentIdentity,
} from './company-document-identity'

describe('company document identity', () => {
  const complete = companyDocumentIdentity({
    workspace_name: 'ABI OPS demo',
    legal_name: '  Example Builders Corporation  ',
    registered_address: '1 Test Road',
    document_email: 'ops@example.test',
    document_phone: '+63 2 8000 0000',
    bir_tin: '123-456-789-000',
    pcab_license: null,
  })

  it('normalizes configured values and reports only issuance-critical gaps', () => {
    expect(complete.legal_name).toBe('Example Builders Corporation')
    expect(missingDocumentIdentityFields(complete)).toEqual([])
  })

  it('never substitutes workspace branding for missing legal fields', () => {
    const incomplete = companyDocumentIdentity({
      ...complete,
      legal_name: ' ',
      registered_address: null,
      bir_tin: null,
    })
    expect(incomplete.legal_name).toBeNull()
    expect(missingDocumentIdentityFields(incomplete)).toEqual([
      'legal name',
      'registered address',
      'BIR TIN',
    ])
  })

  it('derives a neutral report mark from configured company identity', () => {
    expect(companyMark(complete)).toBe('EBC')
  })

  it('keeps issued documents on their captured identity after settings change', () => {
    const snapshot = {
      schema_version: 1 as const,
      ...complete,
      legal_name: 'Original Legal Entity',
    }
    expect(resolveDocumentIdentity({ current: complete, snapshot, previouslyIssued: true })).toEqual({
      identity: expect.objectContaining({ legal_name: 'Original Legal Entity' }),
      legacyIdentityMissing: false,
    })
  })

  it('does not substitute current settings on legacy issued documents', () => {
    expect(resolveDocumentIdentity({ current: complete, snapshot: null, previouslyIssued: true })).toEqual({
      identity: null,
      legacyIdentityMissing: true,
    })
  })

  it('retains a captured issuer after cancellation changes the current status', () => {
    expect(resolveDocumentIdentity({
      current: complete,
      snapshot: { schema_version: 1, ...complete, legal_name: 'Original issuer' },
      previouslyIssued: false,
    }).identity?.legal_name).toBe('Original issuer')
  })
})
