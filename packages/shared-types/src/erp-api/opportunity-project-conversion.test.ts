import { describe, expect, it } from 'vitest'
import {
  opportunityProjectConversionCommandSchema,
  opportunityProjectConversionResultSchema,
} from './opportunity-project-conversion'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('opportunity project conversion core API contract', () => {
  it('accepts only the empty server-authoritative command', () => {
    expect(opportunityProjectConversionCommandSchema.parse({})).toEqual({})
    expect(
      opportunityProjectConversionCommandSchema.safeParse({ tenantId: UUID })
        .success
    ).toBe(false)
  })

  it('validates the tenant-scoped result envelope', () => {
    expect(
      opportunityProjectConversionResultSchema.parse({
        ok: true,
        opportunityId: UUID,
        projectId: '22222222-2222-4222-8222-222222222222',
        checklistId: '33333333-3333-4333-8333-333333333333',
        tenantId: '44444444-4444-4444-8444-444444444444',
        createdProject: true,
      }).tenantId
    ).toBe('44444444-4444-4444-8444-444444444444')
  })

  it('rejects malformed result identifiers', () => {
    expect(
      opportunityProjectConversionResultSchema.safeParse({
        ok: true,
        opportunityId: 'not-a-uuid',
        projectId: UUID,
        checklistId: UUID,
        tenantId: UUID,
        createdProject: false,
      }).success
    ).toBe(false)
  })
})
