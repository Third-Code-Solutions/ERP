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
  opportunityStageWritesUseCoreApi: vi.fn(),
  transitionOpportunityStageThroughCoreApi: vi.fn(),
  legacyConvertOpportunityToProject: vi.fn(),
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

vi.mock('@/lib/erp-core-client', () => ({
  opportunityStageWritesUseCoreApi:
    mocks.opportunityStageWritesUseCoreApi,
  transitionOpportunityStageThroughCoreApi:
    mocks.transitionOpportunityStageThroughCoreApi,
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyRoles: vi.fn(),
}))

vi.mock('@/lib/operations/sla-clock', () => ({
  startSlaClock: mocks.startSlaClock,
  stopSlaClock: mocks.stopSlaClock,
}))

vi.mock('@/lib/operations/won-conversion', () => ({
  convertOpportunityToProject: mocks.legacyConvertOpportunityToProject,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import {
  advanceOpportunityStage,
  createOpportunity,
  createOpportunityForAccount,
} from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const CHECKLIST_ID = '55555555-5555-4555-8555-555555555555'

const PROFILE = {
  user: { id: USER_ID },
  tenantId: TENANT_ID,
  role: 'viewer',
  email: 'viewer@example.com',
  fullName: 'Viewer User',
}

function profileFor(role: string) {
  return {
    ...PROFILE,
    role,
    email: `${role}@example.com`,
    fullName: `${role} User`,
  }
}

function successfulWonTransition(toStage: 'won' | 'closed_won' = 'won') {
  return {
    ok: true as const,
    status: 200,
    data: {
      ok: true as const,
      opportunityId: OPPORTUNITY_ID,
      tenantId: TENANT_ID,
      fromStage: toStage === 'won' ? 'contract' : 'resubmission',
      toStage,
      projectId: PROJECT_ID,
      checklistId: CHECKLIST_ID,
      convertedToProject: true,
    },
  }
}

function expectNoLocalStageEffects() {
  expect(mocks.select).not.toHaveBeenCalled()
  expect(mocks.insert).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  expect(mocks.stopSlaClock).not.toHaveBeenCalled()
  expect(mocks.startSlaClock).not.toHaveBeenCalled()
  expect(mocks.legacyConvertOpportunityToProject).not.toHaveBeenCalled()
}

describe('pipeline action authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.can.mockReturnValue(false)
    mocks.opportunityStageWritesUseCoreApi.mockReturnValue(false)
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.startSlaClock.mockResolvedValue(undefined)
    mocks.stopSlaClock.mockResolvedValue(undefined)
    mocks.legacyConvertOpportunityToProject.mockResolvedValue(undefined)
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

  it('blocks a Won transition before Core or local database access', async () => {
    const result = await advanceOpportunityStage(OPPORTUNITY_ID, 'won')

    expect(result).toEqual({
      error: 'Forbidden: role "viewer" cannot advance opportunities',
    })
    expect(mocks.can).toHaveBeenCalledWith(
      PROFILE.role,
      'opportunity.advance_stage'
    )
    expect(mocks.opportunityStageWritesUseCoreApi).not.toHaveBeenCalled()
    expect(
      mocks.transitionOpportunityStageThroughCoreApi
    ).not.toHaveBeenCalled()
    expectNoLocalStageEffects()
  })
})

describe('atomic Won-to-Project pipeline handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.can.mockReturnValue(true)
    mocks.opportunityStageWritesUseCoreApi.mockReturnValue(true)
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(
      successfulWonTransition()
    )
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.startSlaClock.mockResolvedValue(undefined)
    mocks.stopSlaClock.mockResolvedValue(undefined)
    mocks.legacyConvertOpportunityToProject.mockResolvedValue(undefined)
  })

  it.each(['owner', 'admin', 'sales'])(
    'routes an authorized %s Won transition only through Core',
    async (role) => {
      mocks.getUserProfile.mockResolvedValue(profileFor(role))

      const result = await advanceOpportunityStage(
        OPPORTUNITY_ID,
        'won',
        '  Signed commercial package  '
      )

      expect(result).toEqual({ projectId: PROJECT_ID })
      expect(mocks.can).toHaveBeenCalledWith(
        role,
        'opportunity.advance_stage'
      )
      expect(mocks.opportunityStageWritesUseCoreApi).toHaveBeenCalledWith(
        TENANT_ID
      )
      expect(
        mocks.transitionOpportunityStageThroughCoreApi
      ).toHaveBeenCalledWith(
        OPPORTUNITY_ID,
        { newStage: 'won', reason: 'Signed commercial package' },
        expect.stringMatching(/^pipeline-won-[a-f0-9]{64}$/)
      )
      expectNoLocalStageEffects()
      expect(mocks.revalidatePath.mock.calls).toEqual([
        ['/pipeline/board'],
        ['/pipeline/coverage'],
        ['/pipeline/conversion'],
        ['/'],
        [`/projects/${PROJECT_ID}`],
      ])
    }
  )

  it('uses a stable key for exact retries and a distinct key for a distinct Won command', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))

    await advanceOpportunityStage(OPPORTUNITY_ID, 'won', 'Signed package')
    await advanceOpportunityStage(OPPORTUNITY_ID, 'won', ' Signed package ')
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(
      successfulWonTransition('closed_won')
    )
    await advanceOpportunityStage(
      OPPORTUNITY_ID,
      'closed_won',
      'Signed package'
    )

    const firstKey =
      mocks.transitionOpportunityStageThroughCoreApi.mock.calls[0]?.[2]
    const retryKey =
      mocks.transitionOpportunityStageThroughCoreApi.mock.calls[1]?.[2]
    const distinctCommandKey =
      mocks.transitionOpportunityStageThroughCoreApi.mock.calls[2]?.[2]
    expect(firstKey).toBe(retryKey)
    expect(distinctCommandKey).not.toBe(firstKey)
    expectNoLocalStageEffects()
  })

  it('fails closed when the exact Web stage-write selector is disabled', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.opportunityStageWritesUseCoreApi.mockReturnValue(false)

    const result = await advanceOpportunityStage(OPPORTUNITY_ID, 'won')

    expect(result).toEqual({
      error: 'Opportunity stage transition is not enabled for this tenant.',
    })
    expect(
      mocks.transitionOpportunityStageThroughCoreApi
    ).not.toHaveBeenCalled()
    expectNoLocalStageEffects()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    [
      'typed Core rejection',
      {
        ok: false as const,
        status: 409,
        error: 'Cannot move from contract to won.',
      },
    ],
    [
      'Core unavailability',
      {
        ok: false as const,
        error:
          'ERP Core API is unavailable. No Opportunity stage transition was committed.',
      },
    ],
    [
      'invalid Core response',
      {
        ok: false as const,
        error:
          'ERP Core API returned an invalid Opportunity stage transition result.',
      },
    ],
  ])('preserves %s without local fallback effects', async (_label, failure) => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(failure)

    const result = await advanceOpportunityStage(OPPORTUNITY_ID, 'won')

    expect(result).toEqual({ error: failure.error })
    expectNoLocalStageEffects()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('maps an unexpected adapter throw to a fail-closed user-visible error', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.transitionOpportunityStageThroughCoreApi.mockRejectedValue(
      new Error('provider detail')
    )

    const result = await advanceOpportunityStage(OPPORTUNITY_ID, 'won')

    expect(result).toEqual({
      error:
        'ERP Core API is unavailable. No Opportunity stage transition was committed.',
    })
    expectNoLocalStageEffects()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a structurally valid non-conversion result before refresh', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue({
      ...successfulWonTransition(),
      data: {
        ...successfulWonTransition().data,
        projectId: null,
        checklistId: null,
        convertedToProject: false,
      },
    })

    const result = await advanceOpportunityStage(OPPORTUNITY_ID, 'won')

    expect(result).toEqual({
      error: 'ERP Core API returned an invalid Won-to-Project transition result.',
    })
    expectNoLocalStageEffects()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('preserves the existing local path for a non-Won transition', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: OPPORTUNITY_ID,
            stage: 'lead',
            tcv_cents: 100_000,
            project_id: null,
            account_id: null,
            lost_reason: null,
          },
        ]),
      }),
    })
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    mocks.update.mockReturnValue({ set: updateSet })

    const result = await advanceOpportunityStage(
      OPPORTUNITY_ID,
      'site_survey'
    )

    expect(result).toEqual({})
    expect(mocks.opportunityStageWritesUseCoreApi).not.toHaveBeenCalled()
    expect(
      mocks.transitionOpportunityStageThroughCoreApi
    ).not.toHaveBeenCalled()
    expect(mocks.select).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'site_survey',
        probability: 25,
        weighted_tcv_cents: 25_000,
      })
    )
    expect(updateWhere).toHaveBeenCalledTimes(1)
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: OPPORTUNITY_ID,
        action: 'stage_change',
        diff: expect.objectContaining({ from: 'lead', to: 'site_survey' }),
      })
    )
    expect(mocks.stopSlaClock).toHaveBeenCalledTimes(1)
    expect(mocks.startSlaClock).toHaveBeenCalledTimes(1)
    expect(mocks.legacyConvertOpportunityToProject).not.toHaveBeenCalled()
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/pipeline/board'],
      ['/pipeline/coverage'],
      ['/pipeline/conversion'],
      ['/'],
    ])
  })
})
