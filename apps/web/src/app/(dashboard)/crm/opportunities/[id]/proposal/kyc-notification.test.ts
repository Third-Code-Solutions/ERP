import { describe, expect, it } from 'vitest'
import { kycTrackNotification } from './kyc-notification'

const base = {
  trackLabel: 'Credit Investigation',
  accountName: 'Northstar MEP Inc.',
}

describe('kycTrackNotification', () => {
  it('tells Sales and Finance about an approval', () => {
    expect(kycTrackNotification({ ...base, action: 'approve', status: 'approved' })).toEqual({
      recipientRoles: ['sales', 'finance'],
      subject: 'Credit Investigation approved',
      body: 'Northstar MEP Inc.: Credit Investigation is now approved.',
    })
  })

  it('reaches Sales on a rejection and says how to reopen the review', () => {
    const notification = kycTrackNotification({ ...base, action: 'reject', status: 'rejected' })
    expect(notification.recipientRoles).toEqual(['owner', 'admin', 'sales'])
    expect(notification.body).toContain('Resubmit the PPRF to reopen the review.')
  })

  it('reaches Sales on a flag', () => {
    const notification = kycTrackNotification({ ...base, action: 'flag', status: 'flagged' })
    expect(notification.recipientRoles).toEqual(['owner', 'admin', 'sales'])
    expect(notification.body).toContain('Finance will review the flag')
  })

  it.each(['start', 'recommend'] as const)('keeps %s with owner and admin', (action) => {
    const notification = kycTrackNotification({ ...base, action, status: 'in_review' })
    expect(notification.recipientRoles).toEqual(['owner', 'admin'])
    expect(notification.subject).toBe('Credit Investigation in review')
  })

  it('names no opportunity id and omits the account prefix when the name is unknown', () => {
    const notification = kycTrackNotification({
      ...base,
      accountName: null,
      action: 'flag',
      status: 'flagged',
    })
    expect(notification.body.startsWith('Credit Investigation is now flagged.')).toBe(true)
    expect(notification.body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
  })
})
