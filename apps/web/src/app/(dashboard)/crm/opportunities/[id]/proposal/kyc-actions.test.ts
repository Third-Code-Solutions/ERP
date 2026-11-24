import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  applyOpportunityKycTrackAction: vi.fn(),
  notifyRoles: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@third-code-erp/auth', () => ({ requireUserProfile: mocks.requireUserProfile }))
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('@/lib/operations/opportunity-kyc', () => ({
  applyOpportunityKycTrackAction: mocks.applyOpportunityKycTrackAction,
  opportunityKycTrackLabel: (trackType: string) =>
    trackType === 'credit_investigation' ? 'Credit Investigation' : 'Financial Evaluation',
}))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: mocks.notifyRoles }))

import { updateOpportunityKycTrack } from './kyc-actions'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'

function form(action: string, notes = 'Adverse report'): FormData {
  const data = new FormData()
  data.set('opportunity_id', OPPORTUNITY_ID)
  data.set('track_type', 'credit_investigation')
  data.set('action', action)
  data.set('notes', notes)
  return data
}

function accountLookup(rows: Array<{ name: string | null }>) {
  const builder = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  builder.from.mockReturnValue(builder)
  builder.leftJoin.mockReturnValue(builder)
  builder.where.mockReturnValue(builder)
  mocks.select.mockReturnValueOnce(builder)
  return builder
}

describe('updateOpportunityKycTrack notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'finance',
    })
  })

  it('notifies Sales as well as owner and admin when a track is rejected, naming the account', async () => {
    mocks.applyOpportunityKycTrackAction.mockResolvedValue({ ok: true, trackId: 't1', status: 'rejected' })
    accountLookup([{ name: 'Northstar MEP Inc.' }])

    await expect(updateOpportunityKycTrack(form('reject'))).resolves.toEqual({ status: 'rejected' })

    expect(mocks.notifyRoles).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        recipientRoles: ['owner', 'admin', 'sales'],
        subject: 'Credit Investigation rejected',
        linkUrl: `/crm/opportunities/${OPPORTUNITY_ID}/proposal/pprf`,
        body: expect.stringContaining('Northstar MEP Inc.'),
      })
    )
    const body = String(mocks.notifyRoles.mock.calls[0]?.[0]?.body)
    expect(body).not.toContain(OPPORTUNITY_ID)
    expect(body).not.toContain('Adverse report')
  })

  it('notifies Sales when a track is flagged', async () => {
    mocks.applyOpportunityKycTrackAction.mockResolvedValue({ ok: true, trackId: 't1', status: 'flagged' })
    accountLookup([{ name: 'Northstar MEP Inc.' }])

    await updateOpportunityKycTrack(form('flag'))

    expect(mocks.notifyRoles).toHaveBeenCalledWith(
      expect.objectContaining({ recipientRoles: ['owner', 'admin', 'sales'] })
    )
  })

  it('scopes the account name lookup to the caller tenant', async () => {
    mocks.applyOpportunityKycTrackAction.mockResolvedValue({ ok: true, trackId: 't1', status: 'in_review' })
    const lookup = accountLookup([])

    await updateOpportunityKycTrack(form('recommend'))

    const dialect = new PgDialect()
    const where = dialect.sqlToQuery(lookup.where.mock.calls[0]![0] as SQL)
    expect(where.sql).toContain('"opportunities"."tenant_id"')
    expect(where.params).toEqual([OPPORTUNITY_ID, TENANT_ID])
    const join = dialect.sqlToQuery(lookup.leftJoin.mock.calls[0]![1] as SQL)
    expect(join.sql).toContain('"accounts"."tenant_id"')
    expect(join.params).toEqual([TENANT_ID])
    expect(mocks.notifyRoles).toHaveBeenCalledWith(
      expect.objectContaining({ recipientRoles: ['owner', 'admin'] })
    )
  })

  it('does not notify or look anything up when the track command is refused', async () => {
    mocks.applyOpportunityKycTrackAction.mockResolvedValue({ ok: false, error: 'Cannot recommend a rejected track' })

    await expect(updateOpportunityKycTrack(form('recommend'))).resolves.toEqual({
      error: 'Cannot recommend a rejected track',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.notifyRoles).not.toHaveBeenCalled()
  })
})
