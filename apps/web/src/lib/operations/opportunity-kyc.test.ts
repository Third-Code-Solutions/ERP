import { describe, expect, it, vi } from 'vitest'
import {
  opportunityKycDueAt,
  opportunityKycGateMessage,
} from './opportunity-kyc'

describe('WO-11 opportunity KYC gate', () => {
  it('blocks when one track is pending and includes visible state', () => {
    const message = opportunityKycGateMessage([
      {
        track_type: 'financial_evaluation',
        status: 'approved',
        decision_reason: null,
      },
      {
        track_type: 'credit_investigation',
        status: 'pending',
        decision_reason: null,
      },
    ])

    expect(message).toContain('both Finance tracks are approved')
    expect(message).toContain('Credit Investigation: pending')
  })

  it('surfaces flag or rejection reason', () => {
    expect(
      opportunityKycGateMessage([
        {
          track_type: 'financial_evaluation',
          status: 'flagged',
          decision_reason: 'Missing AFS year 3',
        },
        {
          track_type: 'credit_investigation',
          status: 'approved',
          decision_reason: null,
        },
      ])
    ).toContain('Financial Evaluation: flagged — Missing AFS year 3')
  })

  it('clears only when both tracks are approved', () => {
    expect(
      opportunityKycGateMessage([
        { track_type: 'financial_evaluation', status: 'approved', decision_reason: null },
        { track_type: 'credit_investigation', status: 'approved', decision_reason: null },
      ])
    ).toBeNull()
  })

  it('uses two business days for due date', async () => {
    vi.stubEnv('BUSINESS_CALENDAR_DB_ENABLED', '0')
    const dueAt = await opportunityKycDueAt(
      '11111111-1111-4111-8111-111111111111',
      new Date('2026-08-13T04:00:00.000Z')
    )
    expect(dueAt.toISOString()).toBe('2026-08-17T15:59:59.999Z')
    vi.unstubAllEnvs()
  })
})
