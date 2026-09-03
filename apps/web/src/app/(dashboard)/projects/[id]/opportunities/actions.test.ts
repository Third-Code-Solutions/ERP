import {
  ERP_ROLES,
  type ErpRole,
  type OpportunityCreationResult,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  createOpportunityThroughCoreApi: vi.fn(),
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
  createOpportunityThroughCoreApi: mocks.createOpportunityThroughCoreApi,
  transitionOpportunityStageThroughCoreApi:
    mocks.transitionOpportunityStageThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createOpportunity, transitionStage } from './actions'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const WON_PROJECT_ID = '55555555-5555-4555-8555-555555555555'
const CHECKLIST_ID = '66666666-6666-4666-8666-666666666666'
const ACCOUNT_ID = '77777777-7777-4777-8777-777777777777'

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

function createForm(
  overrides: Partial<{
    projectId: string
    stage: string
    tcvCents: string
    gpCents: string
    closingDate: string
    areaSqm: string
    opportunityType: string
    remarks: string
  }> = {}
): FormData {
  const form = new FormData()
  form.set('project_id', overrides.projectId ?? PROJECT_ID)
  form.set('stage', overrides.stage ?? 'opportunity_creation')
  form.set('tcv_cents', overrides.tcvCents ?? '1500000')
  form.set('gp_cents', overrides.gpCents ?? '-25000')
  form.set('closing_date', overrides.closingDate ?? '2026-10-15')
  form.set('area_sqm', overrides.areaSqm ?? '875')
  form.set('opportunity_type', overrides.opportunityType ?? ' Fit-out ')
  form.set('remarks', overrides.remarks ?? ' Qualified referral ')
  return form
}

function successfulCreation(
  overrides: Partial<OpportunityCreationResult> = {}
) {
  return {
    ok: true as const,
    status: 201,
    data: {
      ok: true as const,
      opportunityId: OPPORTUNITY_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      accountId: ACCOUNT_ID,
      repId: USER_ID,
      stage: 'opportunity_creation' as const,
      probability: 10 as const,
      tcvCents: '1500000',
      gpCents: '-25000',
      weightedTcvCents: '150000',
      closingDate: '2026-10-14T16:00:00.000Z',
      areaSqm: 875,
      opportunityType: 'Fit-out',
      remarks: 'Qualified referral',
      createdAt: '2026-09-03T01:02:03.000Z',
      ...overrides,
    },
  }
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

function expectStructuredActionLogs(expectedCount?: number): void {
  if (expectedCount === undefined) {
    expect(console.info).toHaveBeenCalled()
  } else {
    expect(console.info).toHaveBeenCalledTimes(expectedCount)
  }
  for (const [serialized] of vi.mocked(console.info).mock.calls) {
    expect(typeof serialized).toBe('string')
    const event = JSON.parse(String(serialized)) as Record<string, unknown>
    expect(event).toMatchObject({
      event: 'project_opportunity_action',
      trace_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      ),
      action: expect.stringMatching(/^project_opportunity\.(create|transition)$/),
      outcome: expect.any(String),
    })
    expect(event).toHaveProperty('tenant_id')
    expect(event).toHaveProperty('actor_id')
    expect(serialized).not.toContain('never-log')
    expect(serialized).not.toContain('Qualified referral')
    expect(serialized).not.toContain('1500000')
  }
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
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    mocks.requireUserProfile.mockResolvedValue(profileFor('sales'))
    mocks.opportunityStageWritesUseCoreApi.mockReturnValue(true)
    mocks.createOpportunityThroughCoreApi.mockResolvedValue(successfulCreation())
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

  afterEach(() => {
    expectStructuredActionLogs()
    vi.restoreAllMocks()
  })

  describe('createOpportunity', () => {
    it.each(ERP_ROLES)(
      'enforces the central create policy for %s',
      async (role) => {
        mocks.requireUserProfile.mockResolvedValue(profileFor(role))

        const result = await createOpportunity(createForm())

        if (AUTHORIZED_ROLES.has(role)) {
          expect(result).toEqual({})
          expect(mocks.createOpportunityThroughCoreApi).toHaveBeenCalledOnce()
        } else {
          expect(result).toEqual({ error: 'Forbidden' })
          expect(mocks.createOpportunityThroughCoreApi).not.toHaveBeenCalled()
        }
        expectNoLocalStageWork()
        expectStructuredActionLogs(1)
      }
    )

    it('normalizes the complete strict command and calls selected Core once', async () => {
      const form = createForm()
      form.set('account_id', USER_ID)
      form.set('tenant_id', USER_ID)
      form.set('actor_id', USER_ID)

      const result = await createOpportunity(form)

      expect(result).toEqual({})
      expect(mocks.opportunityStageWritesUseCoreApi).toHaveBeenCalledWith(TENANT_ID)
      expect(mocks.createOpportunityThroughCoreApi).toHaveBeenCalledWith(
        {
          projectId: PROJECT_ID,
          stage: 'opportunity_creation',
          tcvCents: '1500000',
          gpCents: '-25000',
          closingDate: '2026-10-15T00:00:00+08:00',
          areaSqm: 875,
          opportunityType: 'Fit-out',
          remarks: 'Qualified referral',
        },
        expect.stringMatching(/^project-opportunity-create-[a-f0-9]{64}$/)
      )
      expect(mocks.createOpportunityThroughCoreApi).toHaveBeenCalledOnce()
      expectNoLocalStageWork()
      expectStructuredActionLogs(1)
    })

    it('materializes strict initial-stage and monetary defaults in the Core command', async () => {
      const form = new FormData()
      form.set('project_id', PROJECT_ID)
      mocks.createOpportunityThroughCoreApi.mockResolvedValue(
        successfulCreation({
          tcvCents: '0',
          gpCents: '0',
          weightedTcvCents: '0',
          closingDate: null,
          areaSqm: null,
          opportunityType: null,
          remarks: null,
        })
      )

      const result = await createOpportunity(form)

      expect(result).toEqual({})
      expect(mocks.createOpportunityThroughCoreApi).toHaveBeenCalledWith(
        {
          projectId: PROJECT_ID,
          stage: 'opportunity_creation',
          tcvCents: '0',
          gpCents: '0',
        },
        expect.stringMatching(/^project-opportunity-create-[a-f0-9]{64}$/)
      )
      expectStructuredActionLogs(1)
    })

    it.each([
      ['non-initial stage', { stage: 'scoping' }],
      ['negative TCV', { tcvCents: '-1' }],
      ['non-canonical TCV', { tcvCents: '01' }],
      ['overflow TCV', { tcvCents: '9007199254740992' }],
      ['non-canonical GP', { gpCents: '+1' }],
      ['overflow GP', { gpCents: '-9007199254740992' }],
      ['invalid date', { closingDate: '2026-02-30' }],
    ])('rejects %s before Core', async (_label, overrides) => {
      const result = await createOpportunity(createForm(overrides))

      expect(result).toEqual({ error: 'Invalid Opportunity creation.' })
      expect(mocks.createOpportunityThroughCoreApi).not.toHaveBeenCalled()
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
      expectNoLocalStageWork()
      expectStructuredActionLogs(1)
    })

    it('returns Unauthorized and does not invent log identity when profile resolution fails', async () => {
      mocks.requireUserProfile.mockRejectedValue(new Error('no session'))

      const result = await createOpportunity(createForm())

      expect(result).toEqual({ error: 'Unauthorized' })
      expect(mocks.createOpportunityThroughCoreApi).not.toHaveBeenCalled()
      const event = JSON.parse(String(vi.mocked(console.info).mock.calls[0]?.[0]))
      expect(event).toMatchObject({ tenant_id: null, actor_id: null })
      expectStructuredActionLogs(1)
    })

    it.each([
      ['selector disabled', 'selector'],
      ['selector throw', 'selector-throw'],
      ['Core returned error', 'core-error'],
      ['Core transport throw', 'core-throw'],
      ['Core timeout', 'timeout'],
      ['Core malformed result', 'malformed'],
    ] as const)('fails closed for %s', async (_label, mode) => {
      if (mode === 'selector') {
        mocks.opportunityStageWritesUseCoreApi.mockReturnValue(false)
      } else if (mode === 'selector-throw') {
        mocks.opportunityStageWritesUseCoreApi.mockImplementation(() => {
          throw new Error('selector configuration')
        })
      } else if (mode === 'core-error') {
        mocks.createOpportunityThroughCoreApi.mockResolvedValue({
          ok: false,
          status: 409,
          error: 'Project cannot create an Opportunity.',
        })
      } else if (mode === 'malformed') {
        mocks.createOpportunityThroughCoreApi.mockResolvedValue({
          ok: true,
          status: 201,
          data: { ok: true },
        })
      } else {
        mocks.createOpportunityThroughCoreApi.mockRejectedValue(
          mode === 'timeout'
            ? new DOMException('timed out', 'TimeoutError')
            : new Error('transport detail')
        )
      }

      const result = await createOpportunity(createForm())

      expect(result).toHaveProperty('error')
      expect(mocks.createOpportunityThroughCoreApi.mock.calls.length).toBeLessThanOrEqual(1)
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
      expectNoLocalStageWork()
      expectStructuredActionLogs(1)
    })

    it.each([
      ['tenant', { tenantId: USER_ID }],
      ['project', { projectId: USER_ID }],
      ['rep', { repId: ACCOUNT_ID }],
      ['stage', { stage: 'scoping' }],
      ['TCV', { tcvCents: '1500001' }],
      ['GP', { gpCents: '-25001' }],
      ['weighted TCV', { weightedTcvCents: '150001' }],
      ['date', { closingDate: '2026-10-15T00:00:00.000Z' }],
    ])('rejects a mismatched Core %s result before refresh', async (_label, invalid) => {
      mocks.createOpportunityThroughCoreApi.mockResolvedValue(
        successfulCreation(invalid as Partial<OpportunityCreationResult>)
      )

      const result = await createOpportunity(createForm())

      expect(result).toEqual({
        error: 'ERP Core API returned an invalid Opportunity creation result.',
      })
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
      expectNoLocalStageWork()
      expectStructuredActionLogs(1)
    })

    it('uses a stable key that changes with every normalized command field', async () => {
      const retries = [
        createForm(),
        createForm({ opportunityType: 'Fit-out', remarks: 'Qualified referral' }),
        createForm({ projectId: USER_ID }),
        createForm({ tcvCents: '1500001' }),
        createForm({ gpCents: '-25001' }),
        createForm({ closingDate: '2026-10-16' }),
        createForm({ areaSqm: '876' }),
        createForm({ opportunityType: 'MEP' }),
        createForm({ remarks: 'Partner referral' }),
      ]
      for (const form of retries) {
        const expectedProjectId = String(form.get('project_id'))
        mocks.createOpportunityThroughCoreApi.mockResolvedValueOnce(
          successfulCreation({
            projectId: expectedProjectId,
            tcvCents: String(form.get('tcv_cents')),
            gpCents: String(form.get('gp_cents')),
            weightedTcvCents: (
              BigInt(String(form.get('tcv_cents'))) / 10n
            ).toString(),
            closingDate: `${String(form.get('closing_date'))}T00:00:00+08:00`,
            areaSqm: Number(form.get('area_sqm')),
            opportunityType: String(form.get('opportunity_type')).trim(),
            remarks: String(form.get('remarks')).trim(),
          })
        )
        await createOpportunity(form)
      }

      const keys = mocks.createOpportunityThroughCoreApi.mock.calls.map(
        (call) => call[1]
      )
      expect(keys[1]).toBe(keys[0])
      expect(new Set(keys.slice(2)).size).toBe(keys.length - 2)
      expect(keys.slice(2)).not.toContain(keys[0])
      expectStructuredActionLogs(retries.length)
    })

    it('uses one key for equivalent Manila and UTC closing instants', async () => {
      await createOpportunity(createForm({ closingDate: '2026-10-15' }))
      await createOpportunity(
        createForm({ closingDate: '2026-10-14T16:00:00Z' })
      )

      const firstCommand = mocks.createOpportunityThroughCoreApi.mock.calls[0]?.[0]
      const secondCommand = mocks.createOpportunityThroughCoreApi.mock.calls[1]?.[0]
      expect(firstCommand?.closingDate).toBe('2026-10-15T00:00:00+08:00')
      expect(secondCommand?.closingDate).toBe('2026-10-15T00:00:00+08:00')
      expect(mocks.createOpportunityThroughCoreApi.mock.calls[1]?.[1]).toBe(
        mocks.createOpportunityThroughCoreApi.mock.calls[0]?.[1]
      )
      expectStructuredActionLogs(2)
    })

    it('revalidates Project, Pipeline, and Dashboard only after strict success', async () => {
      const result = await createOpportunity(createForm())

      expect(result).toEqual({})
      expect(mocks.revalidatePath.mock.calls).toEqual([
        [`/projects/${PROJECT_ID}`],
        ['/pipeline/board'],
        ['/pipeline/coverage'],
        ['/pipeline/conversion'],
        ['/dashboard'],
      ])
      expectStructuredActionLogs(1)
    })

    it('does not misreport a committed creation when cache revalidation throws', async () => {
      mocks.revalidatePath.mockImplementation(() => {
        throw new Error('cache unavailable')
      })

      const result = await createOpportunity(createForm())

      expect(result).toEqual({})
      expect(mocks.createOpportunityThroughCoreApi).toHaveBeenCalledOnce()
      const event = JSON.parse(String(vi.mocked(console.info).mock.calls[0]?.[0]))
      expect(event).toMatchObject({ outcome: 'success_refresh_failed' })
      expectStructuredActionLogs(1)
    })
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
        tcvCents: '123456',
        gpCents: '-789',
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

  it('returns Unauthorized without selecting Core when profile resolution fails', async () => {
    mocks.requireUserProfile.mockRejectedValue(new Error('no session'))

    const result = await transitionStage(transitionForm())

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(mocks.opportunityStageWritesUseCoreApi).not.toHaveBeenCalled()
    expect(
      mocks.transitionOpportunityStageThroughCoreApi
    ).not.toHaveBeenCalled()
    expectNoLocalStageWork()
  })

  it.each([
    ['negative TCV', { tcvCents: '-1' }],
    ['non-canonical TCV', { tcvCents: '01' }],
    ['overflow TCV', { tcvCents: '9007199254740992' }],
    ['non-canonical GP', { gpCents: '+1' }],
    ['overflow GP', { gpCents: '-9007199254740992' }],
  ])('rejects transition %s before Core', async (_label, overrides) => {
    const result = await transitionStage(transitionForm(overrides))

    expect(result).toEqual({
      error: 'Invalid Opportunity stage transition.',
    })
    expect(
      mocks.transitionOpportunityStageThroughCoreApi
    ).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expectNoLocalStageWork()
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
