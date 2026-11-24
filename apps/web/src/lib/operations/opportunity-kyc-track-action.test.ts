import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  execute: vi.fn(),
  select: vi.fn(),
  selectResults: [] as unknown[][],
  selectWheres: [] as unknown[],
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  writeAuditLogInTransaction: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { transaction: mocks.transaction },
}))
vi.mock('@third-code-erp/auth', () => ({ can: mocks.can }))
vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: mocks.writeAuditLogInTransaction,
}))
vi.mock('./business-calendar', () => ({ resolveTenantBusinessDayService: vi.fn() }))

import { applyOpportunityKycTrackAction } from './opportunity-kyc'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const TRACK_ID = '44444444-4444-4444-8444-444444444444'
const tx = { execute: mocks.execute, select: mocks.select, update: mocks.update }

function track(overrides: Record<string, unknown>) {
  return {
    id: TRACK_ID,
    tenant_id: TENANT_ID,
    opportunity_id: OPPORTUNITY_ID,
    track_type: 'credit_investigation',
    status: 'in_review',
    notes: null,
    decision_reason: null,
    prepared_by: ACTOR_ID,
    prepared_at: new Date('2026-11-01T00:00:00.000Z'),
    fc_recommended_by: null,
    fc_recommended_at: null,
    president_decided_by: null,
    president_decided_at: null,
    ...overrides,
  }
}

function run(action: string, notes?: string) {
  return applyOpportunityKycTrackAction({
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    actorRole: 'owner',
    input: {
      opportunity_id: OPPORTUNITY_ID,
      track_type: 'credit_investigation',
      action,
      ...(notes === undefined ? {} : { notes }),
    },
  } as Parameters<typeof applyOpportunityKycTrackAction>[0])
}

describe('applyOpportunityKycTrackAction review rules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectResults.length = 0
    mocks.selectWheres.length = 0
    mocks.can.mockReturnValue(true)
    mocks.transaction.mockImplementation(async (callback: (t: typeof tx) => unknown) => callback(tx))
    mocks.execute.mockResolvedValue(undefined)
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: (condition: unknown) => {
          mocks.selectWheres.push(condition)
          return { limit: () => Promise.resolve(mocks.selectResults.shift() ?? []) }
        },
      }),
    }))
    mocks.update.mockImplementation(() => ({ set: mocks.set }))
    mocks.set.mockImplementation(() => ({ where: mocks.updateWhere }))
    mocks.updateWhere.mockResolvedValue(undefined)
    mocks.writeAuditLogInTransaction.mockResolvedValue(undefined)
  })

  function given(row: ReturnType<typeof track>) {
    mocks.selectResults.push([{ id: OPPORTUNITY_ID }], [row])
  }

  it.each([
    ['no notes', undefined],
    ['the flag reason resubmitted', 'Adverse credit report'],
  ])('refuses to recommend a flagged track with %s', async (_label, notes) => {
    given(track({ status: 'flagged', decision_reason: 'Adverse credit report', notes: 'Adverse credit report' }))

    const result = await run('recommend', notes)

    expect(result).toEqual({
      ok: false,
      error: 'Add notes on how the flag was resolved before recommending this track',
    })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('recommends a flagged track once the resolution is written down', async () => {
    given(track({ status: 'flagged', decision_reason: 'Adverse credit report' }))

    const result = await run('recommend', 'Client settled the account; bank letter on file')

    expect(result).toEqual({ ok: true, trackId: TRACK_ID, status: 'in_review' })
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'in_review',
        fc_recommended_by: ACTOR_ID,
        fc_recommended_at: expect.any(Date),
        decision_reason: null,
        notes: 'Client settled the account; bank letter on file',
      })
    )
  })

  it('withdraws the FC recommendation when a recommended track is flagged', async () => {
    given(track({ fc_recommended_by: ACTOR_ID, fc_recommended_at: new Date('2026-11-02T00:00:00.000Z') }))

    const result = await run('flag', 'Director is on a sanctions list')

    expect(result).toEqual({ ok: true, trackId: TRACK_ID, status: 'flagged' })
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'flagged',
        decision_reason: 'Director is on a sanctions list',
        fc_recommended_by: null,
        fc_recommended_at: null,
      })
    )
  })

  it('refuses to approve a flagged track that still carries an older recommendation', async () => {
    given(
      track({
        status: 'flagged',
        decision_reason: 'Director is on a sanctions list',
        fc_recommended_by: ACTOR_ID,
        fc_recommended_at: new Date('2026-11-02T00:00:00.000Z'),
      })
    )

    const result = await run('approve')

    expect(result).toEqual({
      ok: false,
      error: 'A flagged track needs a new FC recommendation before approval',
    })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('answers not found for an opportunity outside the caller tenant and reads no track', async () => {
    mocks.selectResults.push([])

    const result = await run('recommend', 'Resolved')

    expect(result).toEqual({ ok: false, error: 'Opportunity not found' })
    expect(mocks.select).toHaveBeenCalledTimes(1)
    const lookup = new PgDialect().sqlToQuery(mocks.selectWheres[0] as SQL)
    expect(lookup.sql).toContain('"opportunities"."tenant_id"')
    expect(lookup.params).toEqual([OPPORTUNITY_ID, TENANT_ID])
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
