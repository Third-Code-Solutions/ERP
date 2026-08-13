import { describe, expect, it } from 'vitest'
import { opportunityKycTrackCommandSchema } from '../opportunity-kyc'

const valid = {
  opportunity_id: '11111111-1111-4111-8111-111111111111',
  track_type: 'financial_evaluation' as const,
  action: 'recommend' as const,
  notes: 'FC recommendation recorded',
}

describe('WO-11 opportunity KYC command contract', () => {
  it('accepts a typed track command', () => {
    expect(opportunityKycTrackCommandSchema.parse(valid)).toEqual(valid)
  })

  it('rejects an unknown field at the API boundary', () => {
    expect(
      opportunityKycTrackCommandSchema.safeParse({ ...valid, bypass: true }).success
    ).toBe(false)
  })

  it('rejects cross-domain track and action values', () => {
    expect(
      opportunityKycTrackCommandSchema.safeParse({
        ...valid,
        track_type: 'account',
      }).success
    ).toBe(false)
    expect(
      opportunityKycTrackCommandSchema.safeParse({
        ...valid,
        action: 'force_approve',
      }).success
    ).toBe(false)
  })
})
