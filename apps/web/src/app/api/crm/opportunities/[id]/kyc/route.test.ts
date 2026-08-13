import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  dbSelect: vi.fn(),
  getOpportunityKycTracks: vi.fn(),
  opportunityKycGateMessage: vi.fn(),
  opportunityKycTrackLabel: vi.fn(),
  applyOpportunityKycTrackAction: vi.fn(),
  notifyRoles: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.dbSelect },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  opportunities: {
    id: {},
    tenant_id: {},
  },
}))

vi.mock('@/lib/operations/opportunity-kyc', () => ({
  getOpportunityKycTracks: mocks.getOpportunityKycTracks,
  opportunityKycGateMessage: mocks.opportunityKycGateMessage,
  opportunityKycTrackLabel: mocks.opportunityKycTrackLabel,
  applyOpportunityKycTrackAction: mocks.applyOpportunityKycTrackAction,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: mocks.notifyRoles,
}))

import { GET, POST } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const TRACK_ID = '44444444-4444-4444-8444-444444444444'

function context() {
  return { params: Promise.resolve({ id: OPPORTUNITY_ID }) }
}

function jsonRequest(body: unknown) {
  return new Request(`http://localhost/api/crm/opportunities/${OPPORTUNITY_ID}/kyc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('opportunity KYC API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'finance',
      user: { id: ACTOR_ID },
    })
    mocks.dbSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue([{ id: OPPORTUNITY_ID }]),
        }),
      }),
    })
    mocks.getOpportunityKycTracks.mockResolvedValue([])
    mocks.opportunityKycGateMessage.mockReturnValue('Pipeline locked')
    mocks.opportunityKycTrackLabel.mockReturnValue('Financial Evaluation')
    mocks.applyOpportunityKycTrackAction.mockResolvedValue({
      ok: true,
      trackId: TRACK_ID,
      status: 'in_review',
    })
    mocks.notifyRoles.mockResolvedValue(undefined)
  })

  it('requires an authenticated profile', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const getResponse = await GET(new Request('http://localhost'), context())
    const postResponse = await POST(jsonRequest({}), context())

    expect(getResponse.status).toBe(401)
    expect(postResponse.status).toBe(401)
    expect(mocks.dbSelect).not.toHaveBeenCalled()
    expect(mocks.applyOpportunityKycTrackAction).not.toHaveBeenCalled()
  })

  it('returns the tenant-scoped gate state', async () => {
    const response = await GET(new Request('http://localhost'), context())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      opportunityId: OPPORTUNITY_ID,
      tracks: [],
      gate: 'Pipeline locked',
    })
    expect(mocks.getOpportunityKycTracks).toHaveBeenCalledWith(
      TENANT_ID,
      OPPORTUNITY_ID,
    )
  })

  it('rejects malformed commands before business logic', async () => {
    const response = await POST(
      jsonRequest({
        track_type: 'financial_evaluation',
        action: 'not-a-command',
        notes: 'x',
      }),
      context(),
    )

    expect(response.status).toBe(400)
    expect(mocks.applyOpportunityKycTrackAction).not.toHaveBeenCalled()
  })

  it('maps authorization and successful state changes to stable HTTP contracts', async () => {
    mocks.applyOpportunityKycTrackAction.mockResolvedValueOnce({
      ok: false,
      error: 'Forbidden: president approval requires owner or admin',
    })
    const forbidden = await POST(
      jsonRequest({
        track_type: 'financial_evaluation',
        action: 'approve',
      }),
      context(),
    )
    expect(forbidden.status).toBe(403)

    const success = await POST(
      jsonRequest({
        track_type: 'financial_evaluation',
        action: 'start',
      }),
      context(),
    )
    expect(success.status).toBe(200)
    await expect(success.json()).resolves.toEqual({
      opportunityId: OPPORTUNITY_ID,
      trackId: TRACK_ID,
      status: 'in_review',
    })
    expect(mocks.notifyRoles).toHaveBeenCalledTimes(1)
  })
})
