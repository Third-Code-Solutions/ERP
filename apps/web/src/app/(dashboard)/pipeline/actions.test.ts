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

function successfulNonWonTransition(
  fromStage: 'lead' | 'site_survey' | 'design' | 'bom_submission' | 'negotiation' = 'lead',
  toStage: 'site_survey' | 'design' | 'bom_submission' | 'negotiation' | 'contract' | 'lost' =
    'site_survey'
) {
  return {
    ok: true as const,
    status: 200,
    data: {
      ok: true as const,
      opportunityId: OPPORTUNITY_ID,
      tenantId: TENANT_ID,
      fromStage,
      toStage,
      projectId: null,
      checklistId: null,
      convertedToProject: false,
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
        ['/pipeline'],
        ['/pipeline/coverage'],
        ['/pipeline/list'],
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

  it('gives each user gesture its own key so a repeated move is not replayed', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    const FIRST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const SECOND = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(
      successfulNonWonTransition('negotiation', 'bom_submission')
    )

    await advanceOpportunityStage(OPPORTUNITY_ID, 'bom_submission', 'Redo BOM', FIRST)
    await advanceOpportunityStage(OPPORTUNITY_ID, 'bom_submission', 'Redo BOM', FIRST)
    await advanceOpportunityStage(OPPORTUNITY_ID, 'bom_submission', 'Redo BOM', SECOND)
    await advanceOpportunityStage(OPPORTUNITY_ID, 'bom_submission', 'Redo BOM', 'not-a-uuid')
    await advanceOpportunityStage(OPPORTUNITY_ID, 'bom_submission', 'Redo BOM')

    const keys = mocks.transitionOpportunityStageThroughCoreApi.mock.calls.map(
      (call) => call[2]
    )
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
    // An invalid or absent attempt id falls back to the original key.
    expect(keys[3]).toBe(keys[4])
    expect(keys[3]).not.toBe(keys[0])
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

  it('routes an authorized non-Won transition only through Core', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(
      successfulNonWonTransition()
    )

    const result = await advanceOpportunityStage(
      OPPORTUNITY_ID,
      'site_survey',
      '  Site visit completed  '
    )

    expect(result).toEqual({})
    expect(mocks.opportunityStageWritesUseCoreApi).toHaveBeenCalledWith(
      TENANT_ID
    )
    expect(
      mocks.transitionOpportunityStageThroughCoreApi
    ).toHaveBeenCalledWith(
      OPPORTUNITY_ID,
      { newStage: 'site_survey', reason: 'Site visit completed' },
      expect.stringMatching(/^pipeline-stage-[a-f0-9]{64}$/)
    )
    expectNoLocalStageEffects()
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/pipeline'],
      ['/pipeline/coverage'],
      ['/pipeline/list'],
      ['/'],
    ])
  })

  it('uses a stable key for exact non-Won retries and a distinct key for a distinct command', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(
      successfulNonWonTransition()
    )

    await advanceOpportunityStage(OPPORTUNITY_ID, 'site_survey', 'Visit done')
    await advanceOpportunityStage(OPPORTUNITY_ID, 'site_survey', ' Visit done ')
    await advanceOpportunityStage(OPPORTUNITY_ID, 'site_survey', 'New evidence')

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

  it('handles selector failure without Core, local effects, or refresh', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.opportunityStageWritesUseCoreApi.mockImplementation(() => {
      throw new Error('invalid selector configuration')
    })

    const result = await advanceOpportunityStage(
      OPPORTUNITY_ID,
      'site_survey'
    )

    expect(result).toEqual({
      error:
        'Opportunity stage transition could not be selected. No Opportunity stage transition was committed.',
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
        error: 'Cannot move from lead to site_survey.',
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
      'invalid adapter response',
      {
        ok: false as const,
        error:
          'ERP Core API returned an invalid Opportunity stage transition result.',
      },
    ],
  ])('preserves non-Won %s without local effects or refresh', async (_label, failure) => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(failure)

    const result = await advanceOpportunityStage(
      OPPORTUNITY_ID,
      'site_survey'
    )

    expect(result).toEqual({ error: failure.error })
    expectNoLocalStageEffects()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('maps an unexpected non-Won adapter throw to a handled failure', async () => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.transitionOpportunityStageThroughCoreApi.mockRejectedValue(
      new Error('provider detail')
    )

    const result = await advanceOpportunityStage(
      OPPORTUNITY_ID,
      'site_survey'
    )

    expect(result).toEqual({
      error:
        'ERP Core API is unavailable. No Opportunity stage transition was committed.',
    })
    expectNoLocalStageEffects()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    [
      'opportunity identity',
      {
        opportunityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ],
    [
      'tenant identity',
      { tenantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    ],
    ['from-stage transition edge', { fromStage: 'design' }],
    ['to-stage identity', { toStage: 'design' }],
    ['conversion flag', { convertedToProject: true }],
    ['project identity', { projectId: PROJECT_ID }],
    ['checklist identity', { checklistId: CHECKLIST_ID }],
  ])('rejects an invalid non-Won %s result before refresh', async (_label, invalid) => {
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    const transition = successfulNonWonTransition()
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue({
      ...transition,
      data: { ...transition.data, ...invalid },
    })

    const result = await advanceOpportunityStage(
      OPPORTUNITY_ID,
      'site_survey'
    )

    expect(result).toEqual({
      error:
        'ERP Core API returned an invalid Opportunity stage transition result.',
    })
    expectNoLocalStageEffects()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('opportunity money validation', () => {
  const INVALID_MONEY = {
    error:
      'TCV must be a peso amount from 0 to 1,000,000,000 and GP from -1,000,000,000 to 1,000,000,000, with at most 2 decimals.',
  }

  function moneyForm(fields: Record<string, string>): FormData {
    const form = new FormData()
    form.set('project_id', PROJECT_ID)
    form.set('account_id', '66666666-6666-4666-8666-666666666666')
    for (const [key, value] of Object.entries(fields)) form.set(key, value)
    return form
  }

  function insertedValues(): Record<string, unknown> {
    const values = vi.mocked(mocks.insert).mock.results[0]?.value.values
    return values.mock.calls[0][0]
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.can.mockReturnValue(true)
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.select.mockReturnValue({
      from: () => ({ where: vi.fn().mockResolvedValue([{ id: PROJECT_ID }]) }),
    })
    mocks.insert.mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: OPPORTUNITY_ID }]),
      }),
    }))
  })

  it.each(['-1', 'abc', '1.234', '1,234.56', '1e3', 'Infinity', '1000000000.01'])(
    'rejects TCV %s before database access',
    async (tcv) => {
      await expect(createOpportunity(moneyForm({ tcv }))).resolves.toEqual(INVALID_MONEY)
      expect(mocks.select).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
    }
  )

  it.each(['abc', '--5', '-1000000000.01', '1.234'])(
    'rejects GP %s on the account flow before database access',
    async (gp) => {
      await expect(
        createOpportunityForAccount(moneyForm({ tcv: '100', gp }))
      ).resolves.toEqual(INVALID_MONEY)
      expect(mocks.select).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
    }
  )

  it('refuses to create a deal directly in Won', async () => {
    await expect(
      createOpportunityForAccount(moneyForm({ tcv: '100', gp: '10', stage: 'won' }))
    ).resolves.toEqual({
      error:
        'Create the deal at an earlier stage and advance it to Won so its project is created.',
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('accepts a negative GP (loss-making deal)', async () => {
    await expect(
      createOpportunity(moneyForm({ tcv: '100', gp: '-5.25' }))
    ).resolves.toEqual({})

    expect(insertedValues()).toMatchObject({ tcv_cents: 10_000, gp_cents: -525 })
  })

  it('stores exact cents and keeps blank amounts at zero', async () => {
    await expect(
      createOpportunity(moneyForm({ tcv: '1234.56', gp: '', probability: '50' }))
    ).resolves.toEqual({})

    expect(insertedValues()).toMatchObject({
      tcv_cents: 123_456,
      gp_cents: 0,
      weighted_tcv_cents: 61_728,
    })
  })

  it('accepts the upper bound exactly', async () => {
    await expect(
      createOpportunity(moneyForm({ tcv: '1000000000', gp: '0.1' }))
    ).resolves.toEqual({})

    expect(insertedValues()).toMatchObject({
      tcv_cents: 100_000_000_000,
      gp_cents: 10,
    })
  })
})
