import {
  ERP_ROLES,
  type ErpRole,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  selectWhere: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
  opportunityStageWritesUseCoreApi: vi.fn(),
  transitionOpportunityStageThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@third-code-erp/auth')>()
  return { ...actual, requireUserProfile: mocks.requireUserProfile }
})

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
  computeDiff: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  opportunityStageWritesUseCoreApi: mocks.opportunityStageWritesUseCoreApi,
  transitionOpportunityStageThroughCoreApi:
    mocks.transitionOpportunityStageThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { transitionStage } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const WON_PROJECT_ID = '55555555-5555-4555-8555-555555555555'
const CHECKLIST_ID = '66666666-6666-4666-8666-666666666666'

const AUTHORIZED_ROLES: ReadonlySet<ErpRole> = new Set([
  'owner',
  'admin',
  'sales',
])

function profileFor(role: ErpRole) {
  return {
    user: { id: USER_ID },
    tenantId: TENANT_ID,
    role,
    email: `${role}@example.com`,
    fullName: `${role} User`,
  }
}

function transitionForm(
  overrides: Partial<{
    newStage: string
    projectId: string
    tcvCents: string
    gpCents: string
    closingDate: string
    reason: string
  }> = {}
): FormData {
  const form = new FormData()
  form.set('opportunity_id', OPPORTUNITY_ID)
  form.set('new_stage', overrides.newStage ?? 'scoping')
  form.set('project_id', overrides.projectId ?? PROJECT_ID)
  if (overrides.tcvCents !== undefined) {
    form.set('tcv_cents', overrides.tcvCents)
  }
  if (overrides.gpCents !== undefined) {
    form.set('gp_cents', overrides.gpCents)
  }
  if (overrides.closingDate !== undefined) {
    form.set('closing_date', overrides.closingDate)
  }
  if (overrides.reason !== undefined) {
    form.set('reason', overrides.reason)
  }
  return form
}

function successfulTransition(
  overrides: Partial<{
    opportunityId: string
    tenantId: string
    fromStage: OpportunityStage
    toStage: OpportunityStage
    projectId: string | null
    checklistId: string | null
    convertedToProject: boolean
  }> = {}
) {
  return {
    ok: true as const,
    status: 200,
    data: {
      ok: true as const,
      opportunityId: OPPORTUNITY_ID,
      tenantId: TENANT_ID,
      fromStage: 'opportunity_creation' as const,
      toStage: 'scoping' as const,
      projectId: null,
      checklistId: null,
      convertedToProject: false,
      ...overrides,
    },
  }
}

function expectNoLocalStageWork(): void {
  expect(mocks.select).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.writeAuditLog).not.toHaveBeenCalled()
}

function manilaCalendarDate(value: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

describe('project Opportunity stage action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.opportunityStageWritesUseCoreApi.mockReturnValue(true)
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(
      successfulTransition()
    )
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.selectWhere })
    mocks.selectWhere.mockResolvedValue([
      {
        id: OPPORTUNITY_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        stage: 'opportunity_creation',
        probability: 10,
        tcv_cents: 100_000,
        gp_cents: 10_000,
        closing_date: null,
      },
    ])
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockResolvedValue(undefined)
    mocks.writeAuditLog.mockResolvedValue(undefined)
  })

  it.each(ERP_ROLES)('enforces the central direct-call policy for %s', async (role) => {
    mocks.requireUserProfile.mockResolvedValue(profileFor(role))

    const result = await transitionStage(transitionForm())

    if (AUTHORIZED_ROLES.has(role)) {
      expect(result).toEqual({})
      expect(
        mocks.transitionOpportunityStageThroughCoreApi
      ).toHaveBeenCalledOnce()
    } else {
      expect(result).toEqual({ error: 'Forbidden' })
      expect(
        mocks.transitionOpportunityStageThroughCoreApi
      ).not.toHaveBeenCalled()
    }
    expectNoLocalStageWork()
  })

  it('sends the complete command through selected Core with normalized date and signed GP', async () => {
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(
      successfulTransition({
        fromStage: 'scoping',
        toStage: 'bom_submission',
      })
    )
    const result = await transitionStage(
      transitionForm({
        newStage: 'bom_submission',
        tcvCents: '123456',
        gpCents: '-789',
        closingDate: '2026-10-31',
        reason: '  Revised commercial package  ',
      })
    )

    expect(result).toEqual({})
    expect(mocks.opportunityStageWritesUseCoreApi).toHaveBeenCalledWith(TENANT_ID)
    expect(mocks.transitionOpportunityStageThroughCoreApi).toHaveBeenCalledWith(
      OPPORTUNITY_ID,
      {
        newStage: 'bom_submission',
        tcvCents: 123456,
        gpCents: -789,
        closingDate: '2026-10-31T00:00:00+08:00',
        reason: 'Revised commercial package',
      },
      expect.stringMatching(/^project-opportunity-stage-[a-f0-9]{64}$/)
    )
    const closingDate =
      mocks.transitionOpportunityStageThroughCoreApi.mock.calls[0]?.[1]
        ?.closingDate
    expect(closingDate).toBe('2026-10-31T00:00:00+08:00')
    expect(manilaCalendarDate(closingDate)).toBe('2026-10-31')
    expectNoLocalStageWork()
  })

  it('preserves omitted commercial fields', async () => {
    await transitionStage(transitionForm())

    expect(mocks.transitionOpportunityStageThroughCoreApi).toHaveBeenCalledWith(
      OPPORTUNITY_ID,
      { newStage: 'scoping' },
      expect.any(String)
    )
  })

  it.each(['2026-02-30', '31-10-2026'])(
    'rejects invalid date-only input %s before Core',
    async (closingDate) => {
      const result = await transitionStage(transitionForm({ closingDate }))

      expect(result).toEqual({
        error: 'Invalid Opportunity stage transition.',
      })
      expect(
        mocks.transitionOpportunityStageThroughCoreApi
      ).not.toHaveBeenCalled()
      expectNoLocalStageWork()
    }
  )

  it('uses one stable key for the normalized full command', async () => {
    const first = transitionForm({
      tcvCents: '123456',
      gpCents: '-789',
      closingDate: '2026-10-31',
      reason: '  Revised package  ',
    })
    const retry = transitionForm({
      tcvCents: '123456',
      gpCents: '-789',
      closingDate: '2026-10-31',
      reason: 'Revised package',
    })
    const changed = transitionForm({
      tcvCents: '123456',
      gpCents: '-790',
      closingDate: '2026-10-31',
      reason: 'Revised package',
    })

    await transitionStage(first)
    await transitionStage(retry)
    await transitionStage(changed)

    const firstKey = mocks.transitionOpportunityStageThroughCoreApi.mock.calls[0]?.[2]
    const retryKey = mocks.transitionOpportunityStageThroughCoreApi.mock.calls[1]?.[2]
    const changedKey = mocks.transitionOpportunityStageThroughCoreApi.mock.calls[2]?.[2]
    expect(retryKey).toBe(firstKey)
    expect(changedKey).not.toBe(firstKey)
  })

  it('returns an invalid-edge Core failure without local work or refresh', async () => {
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'Cannot move from opportunity_creation to closed_won.',
    })

    const result = await transitionStage(
      transitionForm({ newStage: 'closed_won' })
    )

    expect(result).toEqual({
      error: 'Cannot move from opportunity_creation to closed_won.',
    })
    expectNoLocalStageWork()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['selector disabled', 'selector'],
    ['selector failure', 'selector-throw'],
    ['typed Core failure', 'typed'],
    ['transport throw', 'throw'],
  ] as const)('fails closed for %s', async (_label, mode) => {
    if (mode === 'selector') {
      mocks.opportunityStageWritesUseCoreApi.mockReturnValue(false)
    } else if (mode === 'selector-throw') {
      mocks.opportunityStageWritesUseCoreApi.mockImplementation(() => {
        throw new Error('invalid selector configuration')
      })
    } else if (mode === 'typed') {
      mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue({
        ok: false,
        error: 'Core rejected the command.',
      })
    } else {
      mocks.transitionOpportunityStageThroughCoreApi.mockRejectedValue(
        new Error('transport detail')
      )
    }

    const result = await transitionStage(transitionForm())

    expect(result).toHaveProperty('error')
    expectNoLocalStageWork()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    ['opportunity identity', { opportunityId: USER_ID }],
    ['tenant identity', { tenantId: USER_ID }],
    ['from/to edge', { fromStage: 'scoping' as const }],
    ['to-stage identity', { toStage: 'bom_submission' as const }],
    ['conversion flag', { convertedToProject: true }],
    ['project identity', { projectId: PROJECT_ID }],
    ['checklist identity', { checklistId: CHECKLIST_ID }],
  ])('rejects invalid non-Won %s before refresh', async (_label, invalid) => {
    const transition = successfulTransition()
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue({
      ...transition,
      data: { ...transition.data, ...invalid },
    })

    const result = await transitionStage(transitionForm())

    expect(result).toEqual({
      error: 'ERP Core API returned an invalid Opportunity stage transition result.',
    })
    expectNoLocalStageWork()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('revalidates the source Project, Pipeline, and returned Won Project only after validation', async () => {
    mocks.transitionOpportunityStageThroughCoreApi.mockResolvedValue(
      successfulTransition({
        fromStage: 'contract',
        toStage: 'won',
        projectId: WON_PROJECT_ID,
        checklistId: CHECKLIST_ID,
        convertedToProject: true,
      })
    )

    const result = await transitionStage(
      transitionForm({ newStage: 'won' })
    )

    expect(result).toEqual({ projectId: WON_PROJECT_ID })
    expect(mocks.revalidatePath.mock.calls).toEqual([
      [`/projects/${PROJECT_ID}`],
      ['/pipeline/board'],
      ['/pipeline/coverage'],
      ['/pipeline/conversion'],
      ['/dashboard'],
      [`/projects/${WON_PROJECT_ID}`],
    ])
  })
})
