import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  startSlaClock: vi.fn(),
  stopSlaClock: vi.fn(),
  transitionOpportunityStageThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
}))

vi.mock('@/lib/operations/sla-clock', () => ({
  startSlaClock: mocks.startSlaClock,
  stopSlaClock: mocks.stopSlaClock,
}))

vi.mock('@/lib/erp-core-client', () => ({
  transitionOpportunityStageThroughCoreApi:
    mocks.transitionOpportunityStageThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  advanceOpportunityStage,
  createOpportunity,
  createOpportunityForAccount,
} from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer',
  email: 'viewer@example.com',
  fullName: 'Viewer User',
}

describe('pipeline action authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(false)
  })

  it('blocks legacy opportunity creation before database access', async () => {
    const result = await createOpportunity(new FormData())

    expect(result).toEqual({
      error: 'Forbidden: role "viewer" cannot create opportunities',
    })
    expect(mocks.can).toHaveBeenCalledWith(PROFILE.role, 'opportunity.create')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('blocks account opportunity creation before database access', async () => {
    const result = await createOpportunityForAccount(new FormData())

    expect(result).toEqual({
      error: 'Forbidden: role "viewer" cannot create opportunities',
    })
    expect(mocks.can).toHaveBeenCalledWith(PROFILE.role, 'opportunity.create')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects a non-lead manual opportunity before database access', async () => {
    mocks.can.mockReturnValue(true)
    const form = new FormData()
    form.set('stage', 'negotiation')
    form.set('account_id', '33333333-3333-4333-8333-333333333333')
    form.set('prospective_project_name', 'Prospect name')

    await expect(createOpportunityForAccount(form)).resolves.toEqual({
      error: 'New opportunities must start in the Sales Lead stage',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects a prospective project name over 200 characters before database access', async () => {
    mocks.can.mockReturnValue(true)
    const form = new FormData()
    form.set('account_id', '33333333-3333-4333-8333-333333333333')
    form.set('prospective_project_name', 'p'.repeat(201))

    await expect(createOpportunityForAccount(form)).resolves.toEqual({
      error: 'Prospective project name must be between 1 and 200 characters',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('blocks stage advancement before database access', async () => {
    const result = await advanceOpportunityStage(
      '33333333-3333-4333-8333-333333333333',
      'negotiation',
    )

    expect(result).toEqual({
      error: 'Forbidden: role "viewer" cannot advance opportunities',
    })
    expect(mocks.can).toHaveBeenCalledWith(PROFILE.role, 'opportunity.advance_stage')
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('routes a won transition through the atomic Core authority', async () => {
    mocks.can.mockReturnValue(true)
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        opportunityId: '33333333-3333-4333-8333-333333333333',
        tenantId: PROFILE.tenantId,
        fromStage: 'contract',
        toStage: 'won',
        projectId: '44444444-4444-4444-8444-444444444444',
        checklistId: '55555555-5555-4555-8555-555555555555',
        convertedToProject: true,
      },
      status: 200,
    })

    await expect(
      advanceOpportunityStage(
        '33333333-3333-4333-8333-333333333333',
        'won',
        'Signed award package',
      ),
    ).resolves.toEqual({})

    expect(mocks.transitionOpportunityStageThroughCoreApi).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      { newStage: 'won', reason: 'Signed award package' },
      'web-opportunity-stage-33333333-3333-4333-8333-333333333333-won',
    )
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does not perform a legacy won transition when Core rejects the handoff', async () => {
    mocks.can.mockReturnValue(true)
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'Won-to-Project handoff is not enabled for this tenant.',
      status: 503,
    })

    await expect(
      advanceOpportunityStage('33333333-3333-4333-8333-333333333333', 'won'),
    ).resolves.toEqual({
      error: 'Won-to-Project handoff is not enabled for this tenant.',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
