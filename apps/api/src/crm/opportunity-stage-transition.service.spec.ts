import 'reflect-metadata'

import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  STAGE_TRANSITIONS,
  type OpportunityStage,
  type OpportunityStageTransitionCommand,
} from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import type { OpportunityProjectConversionService } from './opportunity-project-conversion.service'
import { OpportunityStageTransitionService } from './opportunity-stage-transition.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'sales',
  email: 'sales@example.test',
}
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'
const CHECKLIST_ID = '66666666-6666-4666-8666-666666666666'
const REQUEST_ID = '77777777-7777-4777-8777-777777777777'
const DENIED_STAGE_ROLES = [
  'estimator',
  'pm',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
] as const satisfies readonly ErpRole[]
const NON_WON_TRANSITIONS = (
  Object.keys(STAGE_TRANSITIONS) as OpportunityStage[]
).flatMap((fromStage) =>
  STAGE_TRANSITIONS[fromStage]
    .filter((toStage) => toStage !== 'won' && toStage !== 'closed_won')
    .map((toStage) => [fromStage, toStage] as const)
)

function commandJson(command: OpportunityStageTransitionCommand): string {
  return `{${Object.keys(command)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${JSON.stringify(
          command[key as keyof OpportunityStageTransitionCommand]
        )}`
    )
    .join(',')}}`
}

function stageHash(
  command: OpportunityStageTransitionCommand = { newStage: 'won' }
): string {
  return createHash('sha256')
    .update(
      `{"command":${commandJson(command)},"opportunityId":"${OPPORTUNITY_ID}"}`
    )
    .digest('hex')
}

function selectQuery(rows: unknown[]) {
  const locked = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({
    for: locked,
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  })
  const whereResult = {
    limit,
    for: locked,
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  }
  const where = vi.fn().mockReturnValue(whereResult)
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

function awaitedWrite(onWrite: () => void) {
  return {
    then: (
      resolve: (value: undefined) => unknown,
      reject: (reason: unknown) => unknown
    ) =>
      Promise.resolve()
        .then(() => {
          onWrite()
          return undefined
        })
        .then(resolve, reject),
  }
}

type KycTrack = {
  trackType: 'financial_evaluation' | 'credit_investigation'
  status: 'pending' | 'approved'
}

function harness({
  role = 'sales',
  tracks = [
    { trackType: 'financial_evaluation', status: 'approved' },
    { trackType: 'credit_investigation', status: 'approved' },
  ],
  accountStatus = 'pending',
  requestState = 'processing',
  conversionError,
  auditError,
  stopClockError,
  startClockError,
  completeRequestError,
  stageEnabled = true,
  conversionEnabled = true,
  accountExists = true,
  accountId = ACCOUNT_ID,
  fromStage = 'contract',
  toStage = 'won',
  tcvCents = 1_000_000,
  gpCents = 250_000,
  closingDate = new Date('2026-09-30T00:00:00.000Z'),
  storedCommand = { newStage: toStage },
  storedResult,
}: {
  role?: ErpRole
  tracks?: KycTrack[]
  accountStatus?: 'pending' | 'approved' | 'not_required'
  requestState?: 'processing' | 'succeeded'
  conversionError?: Error
  auditError?: Error
  stopClockError?: Error
  startClockError?: Error
  completeRequestError?: Error
  stageEnabled?: boolean
  conversionEnabled?: boolean
  accountExists?: boolean
  accountId?: string | null
  fromStage?: OpportunityStage
  toStage?: OpportunityStage
  tcvCents?: number
  gpCents?: number
  closingDate?: Date | null
  storedCommand?: OpportunityStageTransitionCommand
  storedResult?: unknown
} = {}) {
  const convertsToProject = toStage === 'won' || toStage === 'closed_won'
  const replay = {
    ok: true as const,
    opportunityId: OPPORTUNITY_ID,
    tenantId: PRINCIPAL.tenantId,
    fromStage,
    toStage,
    projectId: convertsToProject ? PROJECT_ID : null,
    checklistId: convertsToProject ? CHECKLIST_ID : null,
    convertedToProject: convertsToProject,
  }
  const request = {
    id: REQUEST_ID,
    requestHash: requestState === 'succeeded' ? stageHash(storedCommand) : '',
    state: requestState,
    fromStage,
    toStage: storedCommand.newStage,
    result: requestState === 'succeeded' ? (storedResult ?? replay) : null,
  }
  const kycGated = [
    'design',
    'bom_submission',
    'negotiation',
    'contract',
    'won',
    'resubmission',
    'closed_won',
  ].includes(toStage)
  const terminal = ['won', 'closed_won', 'lost', 'closed_lost'].includes(
    toStage
  )
  let currentStage = requestState === 'succeeded' ? toStage : fromStage
  let currentTcvCents = tcvCents
  let currentGpCents = gpCents
  let currentClosingDate = closingDate
  let currentWeightedTcvCents: number | undefined
  const buildSelects = () => {
    const nextSelects = [
      selectQuery([
        {
          tenantId: PRINCIPAL.tenantId,
          role,
          email: `${role}@example.test`,
        },
      ]),
      selectQuery([
        {
          id: OPPORTUNITY_ID,
          tenantId: PRINCIPAL.tenantId,
          stage: currentStage,
          tcvCents: currentTcvCents,
          gpCents: currentGpCents,
          closingDate: currentClosingDate,
          accountId,
          projectId: null,
          lostReason: null,
        },
      ]),
    ]
    if (accountId) {
      nextSelects.push(
        selectQuery(
          accountExists
            ? [{ id: accountId, kycStatus: accountStatus }]
            : []
        )
      )
    }
    nextSelects.push(selectQuery([request]))
    if (accountId && kycGated) nextSelects.push(selectQuery(tracks))
    if (!terminal) nextSelects.push(selectQuery([]))
    return nextSelects
  }
  let selects = buildSelects()
  const writes: string[] = []
  let transactionWrites: string[] = []
  const recordWrite = (label: string) => transactionWrites.push(label)
  const insertLedger = vi.fn().mockImplementation((values) => {
    const created = request.requestHash === ''
    if (created) request.requestHash = values.request_hash
    return {
      onConflictDoNothing: vi.fn().mockImplementation(async () => {
        if (created) recordWrite('stage-request-claim')
      }),
    }
  })
  let insertCount = 0
  const insert = vi.fn().mockImplementation(() => {
    insertCount += 1
    if (insertCount === 1) return { values: insertLedger }
    return {
      values: vi.fn().mockImplementation(async () => {
        if (startClockError) throw startClockError
        recordWrite('stage-clock-start')
      }),
    }
  })

  let updateCount = 0
  const update = vi.fn().mockImplementation(() => {
    updateCount += 1
    const label =
      updateCount === 1
        ? 'opportunity-stage'
        : updateCount === 2
          ? 'stage-clock-stop'
          : 'stage-request-complete'
    let updatePayload: Record<string, unknown> = {}
    const returning = vi.fn().mockImplementation(async () => {
      if (completeRequestError) throw completeRequestError
      recordWrite(label)
      request.state = 'succeeded'
      request.result = updatePayload.result as typeof request.result
      return [{ id: REQUEST_ID }]
    })
    const where = vi.fn().mockReturnValue(
      updateCount === 3
        ? { returning }
        : awaitedWrite(() => {
            if (label === 'stage-clock-stop' && stopClockError) {
              throw stopClockError
            }
            recordWrite(label)
            if (label === 'opportunity-stage') {
              currentStage = updatePayload.stage as OpportunityStage
              currentTcvCents = updatePayload.tcv_cents as number
              currentGpCents = updatePayload.gp_cents as number
              currentClosingDate = updatePayload.closing_date as Date | null
              currentWeightedTcvCents =
                updatePayload.weighted_tcv_cents as number
            }
          })
    )
    return {
      set: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        updatePayload = payload
        return { where }
      }),
    }
  })

  const transactionClient = {
    select: vi.fn().mockImplementation(() => selects.shift()),
    insert,
    update,
  }
  let committed = false
  let rolledBack = false
  let transactionTail = Promise.resolve()
  // Model the database row-lock guarantee: a waiter observes the request and
  // opportunity state committed by the transaction ahead of it.
  const runTransaction = async (
    callback: (tx: typeof transactionClient) => unknown
  ) => {
    const originalStage = currentStage
    const originalTcvCents = currentTcvCents
    const originalGpCents = currentGpCents
    const originalClosingDate = currentClosingDate
    const originalWeightedTcvCents = currentWeightedTcvCents
    const originalRequestHash = request.requestHash
    const originalRequestState = request.state
    const originalRequestResult = request.result
    selects = buildSelects()
    insertCount = 0
    updateCount = 0
    transactionWrites = []
    try {
      const result = await callback(transactionClient)
      committed = true
      writes.push(...transactionWrites)
      return result
    } catch (error) {
      currentStage = originalStage
      currentTcvCents = originalTcvCents
      currentGpCents = originalGpCents
      currentClosingDate = originalClosingDate
      currentWeightedTcvCents = originalWeightedTcvCents
      request.requestHash = originalRequestHash
      request.state = originalRequestState
      request.result = originalRequestResult
      rolledBack = true
      throw error
    } finally {
      transactionWrites = []
    }
  }
  const transaction = vi.fn(
    (callback: (tx: typeof transactionClient) => unknown) => {
      const result = transactionTail.then(() => runTransaction(callback))
      transactionTail = result.then(
        () => undefined,
        () => undefined
      )
      return result
    }
  )
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockImplementation(async () => {
      if (auditError) throw auditError
      recordWrite('stage-audit')
    }),
  }
  const conversion = {
    convertWithinTransaction: vi.fn().mockImplementation(async () => {
      if (conversionError) throw conversionError
      recordWrite('project-handoff')
      return {
        ok: true,
        opportunityId: OPPORTUNITY_ID,
        projectId: PROJECT_ID,
        checklistId: CHECKLIST_ID,
        tenantId: PRINCIPAL.tenantId,
        createdProject: true,
      }
    }),
  }
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => {
      if (key === 'ERP_OPPORTUNITY_STAGE_WRITES_ENABLED') return stageEnabled
      if (key === 'ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS') {
        return [PRINCIPAL.tenantId]
      }
      if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED') {
        return conversionEnabled
      }
      if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS') {
        return [PRINCIPAL.tenantId]
      }
      return fallback
    }),
  }
  const candidate = new OpportunityStageTransitionService(
    config as unknown as ConfigService,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService,
    conversion as unknown as OpportunityProjectConversionService
  )

  return {
    candidate,
    transaction,
    transactionClient,
    conversion,
    audit,
    writes,
    replay,
    state: {
      get committed() {
        return committed
      },
      get rolledBack() {
        return rolledBack
      },
      get stage() {
        return currentStage
      },
      get tcvCents() {
        return currentTcvCents
      },
      get gpCents() {
        return currentGpCents
      },
      get closingDate() {
        return currentClosingDate
      },
      get weightedTcvCents() {
        return currentWeightedTcvCents
      },
    },
  }
}

describe('Opportunity stage transition atomic authority', () => {
  it.each([
    ['contract', 'lost'],
    ['opportunity_creation', 'closed_lost'],
  ] as const)(
    'rejects %s -> %s without a reason before changing state',
    async (fromStage, toStage) => {
      const probe = harness({ fromStage, toStage, accountId: null })

      await expect(
        probe.candidate.transition(
          OPPORTUNITY_ID,
          { newStage: toStage },
          PRINCIPAL,
          `${toStage}-without-reason`
        )
      ).rejects.toThrow('reason_required')
      expect(probe.state.committed).toBe(false)
      expect(probe.state.rolledBack).toBe(true)
      expect(probe.writes).toEqual([])
    }
  )

  it('rejects a regression without a reason before changing state', async () => {
    const probe = harness({
      fromStage: 'negotiation',
      toStage: 'bom_submission',
      accountId: null,
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'bom_submission' },
        PRINCIPAL,
        'regression-without-reason'
      )
    ).rejects.toThrow('reason_required')
    expect(probe.writes).toEqual([])
  })

  it.each(NON_WON_TRANSITIONS)(
    'commits allowed non-Won transition %s -> %s with a strict non-conversion result',
    async (fromStage, toStage) => {
      const probe = harness({ fromStage, toStage, accountId: null })

      await expect(
        probe.candidate.transition(
          OPPORTUNITY_ID,
          { newStage: toStage, reason: 'Qualified pipeline decision' },
          PRINCIPAL,
          `${fromStage}-${toStage}`
        )
      ).resolves.toEqual({
        ok: true,
        opportunityId: OPPORTUNITY_ID,
        tenantId: PRINCIPAL.tenantId,
        fromStage,
        toStage,
        projectId: null,
        checklistId: null,
        convertedToProject: false,
      })
      expect(probe.state.committed).toBe(true)
      expect(probe.conversion.convertWithinTransaction).not.toHaveBeenCalled()
    }
  )

  it.each<ErpRole>(['owner', 'admin', 'sales'])(
    'allows %s to commit a non-Won transition',
    async (role) => {
      const probe = harness({
        role,
        fromStage: 'lead',
        toStage: 'site_survey',
        accountId: null,
      })

      await expect(
        probe.candidate.transition(
          OPPORTUNITY_ID,
          { newStage: 'site_survey' },
          PRINCIPAL,
          `lead-site-survey-${role}`
        )
      ).resolves.toMatchObject({
        fromStage: 'lead',
        toStage: 'site_survey',
        convertedToProject: false,
      })
    }
  )

  it('enforces dual-track KYC on a gated non-Won transition', async () => {
    const probe = harness({
      fromStage: 'site_survey',
      toStage: 'design',
      tracks: [
        { trackType: 'financial_evaluation', status: 'approved' },
        { trackType: 'credit_investigation', status: 'pending' },
      ],
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'design' },
        PRINCIPAL,
        'design-before-kyc'
      )
    ).rejects.toThrow('Pipeline locked until both Finance tracks are approved')
    expect(probe.state.rolledBack).toBe(true)
    expect(probe.writes).toEqual([])
  })

  it('allows a gated non-Won transition after both KYC tracks are approved', async () => {
    const probe = harness({
      fromStage: 'site_survey',
      toStage: 'design',
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'design' },
        PRINCIPAL,
        'design-after-kyc'
      )
    ).resolves.toMatchObject({
      fromStage: 'site_survey',
      toStage: 'design',
      convertedToProject: false,
    })
  })

  it('rejects a cross-tenant linked Account on a non-Won transition before claiming the command', async () => {
    const probe = harness({
      fromStage: 'site_survey',
      toStage: 'design',
      accountExists: false,
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'design' },
        PRINCIPAL,
        'cross-tenant-account'
      )
    ).rejects.toThrow('Opportunity Account is not available in this tenant')
    expect(probe.transactionClient.insert).not.toHaveBeenCalled()
    expect(probe.writes).toEqual([])
  })

  it('records the required Lost reason in the semantic audit', async () => {
    const probe = harness({
      fromStage: 'contract',
      toStage: 'lost',
      accountId: null,
    })

    await probe.candidate.transition(
      OPPORTUNITY_ID,
      { newStage: 'lost', reason: 'Client selected another bidder' },
      PRINCIPAL,
      'contract-lost-with-reason'
    )

    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      probe.transactionClient,
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        actorId: PRINCIPAL.userId,
        entityType: 'opportunity',
        entityId: OPPORTUNITY_ID,
        action: 'stage_change',
        diff: expect.objectContaining({
          from: 'contract',
          to: 'lost',
          lost_reason: {
            from: null,
            to: 'Client selected another bidder',
          },
        }),
      })
    )
  })

  it('commits commercial edits with the stage and audits their before/after values', async () => {
    const probe = harness({
      fromStage: 'lead',
      toStage: 'site_survey',
      accountId: null,
    })

    await probe.candidate.transition(
      OPPORTUNITY_ID,
      {
        newStage: 'site_survey',
        tcvCents: 1_000_002,
        gpCents: -25_000,
        closingDate: '2026-10-31T00:00:00.000Z',
      },
      PRINCIPAL,
      'commercial-edit'
    )

    expect(probe.state).toMatchObject({
      stage: 'site_survey',
      tcvCents: 1_000_002,
      gpCents: -25_000,
      weightedTcvCents: 250_001,
    })
    expect(probe.state.closingDate).toEqual(
      new Date('2026-10-31T00:00:00.000Z')
    )
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
      probe.transactionClient,
      expect.objectContaining({
        diff: expect.objectContaining({
          tcv_cents: { from: 1_000_000, to: 1_000_002 },
          gp_cents: { from: 250_000, to: -25_000 },
          closing_date: {
            from: '2026-09-30T00:00:00.000Z',
            to: '2026-10-31T00:00:00.000Z',
          },
        }),
      })
    )
    expect(probe.writes).toContain('opportunity-stage')
  })

  it('preserves omitted commercial values while recalculating weighted TCV', async () => {
    const probe = harness({
      fromStage: 'lead',
      toStage: 'site_survey',
      accountId: null,
    })

    await probe.candidate.transition(
      OPPORTUNITY_ID,
      { newStage: 'site_survey' },
      PRINCIPAL,
      'preserve-commercial-edit'
    )

    expect(probe.state).toMatchObject({
      tcvCents: 1_000_000,
      gpCents: 250_000,
    })
    expect(probe.state.closingDate).toEqual(
      new Date('2026-09-30T00:00:00.000Z')
    )
  })

  it('rejects unsafe commercial integers before opening a transaction', async () => {
    const probe = harness({
      fromStage: 'lead',
      toStage: 'site_survey',
      accountId: null,
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        {
          newStage: 'site_survey',
          tcvCents: Number.MAX_SAFE_INTEGER + 1,
        },
        PRINCIPAL,
        'unsafe-commercial-edit'
      )
    ).rejects.toThrow()
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('replays a completed non-Won command without repeating stage, audit, or SLA effects', async () => {
    const probe = harness({
      fromStage: 'lead',
      toStage: 'site_survey',
      accountId: null,
      requestState: 'succeeded',
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'site_survey' },
        PRINCIPAL,
        'lead-site-survey-replay'
      )
    ).resolves.toEqual(probe.replay)
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects an invalid stored non-Won result instead of replaying an unsafe shape', async () => {
    const probe = harness({
      fromStage: 'lead',
      toStage: 'site_survey',
      accountId: null,
      requestState: 'succeeded',
      storedResult: { ok: true, opportunityId: OPPORTUNITY_ID },
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'site_survey' },
        PRINCIPAL,
        'invalid-result-replay'
      )
    ).rejects.toThrow(
      'Opportunity stage transition idempotency result is invalid'
    )
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects non-Won idempotency-key reuse with a different command', async () => {
    const probe = harness({
      fromStage: 'site_survey',
      toStage: 'site_survey',
      accountId: null,
      requestState: 'succeeded',
      storedCommand: { newStage: 'site_survey' },
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'lost', reason: 'Different command' },
        PRINCIPAL,
        'reused-non-won-key'
      )
    ).rejects.toThrow(
      'Idempotency key was already used with a different Opportunity command'
    )
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('includes commercial edits in the idempotency command hash', async () => {
    const probe = harness({
      fromStage: 'site_survey',
      toStage: 'site_survey',
      accountId: null,
      requestState: 'succeeded',
      storedCommand: { newStage: 'site_survey', tcvCents: 1_000_000 },
    })

    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'site_survey', tcvCents: 2_000_000 },
        PRINCIPAL,
        'reused-commercial-key'
      )
    ).rejects.toThrow(
      'Idempotency key was already used with a different Opportunity command'
    )
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('serializes same-key concurrent non-Won retries and commits each effect once', async () => {
    const probe = harness({
      fromStage: 'lead',
      toStage: 'site_survey',
      accountId: null,
    })
    const execute = () =>
      probe.candidate.transition(
        OPPORTUNITY_ID,
        {
          newStage: 'site_survey',
          tcvCents: 1_000_002,
          gpCents: -25_000,
          closingDate: '2026-10-31T00:00:00.000Z',
        },
        PRINCIPAL,
        'lead-site-survey-concurrent'
      )

    const [first, concurrentRetry] = await Promise.all([execute(), execute()])

    expect(concurrentRetry).toEqual(first)
    expect(probe.transaction).toHaveBeenCalledTimes(2)
    expect(probe.state).toMatchObject({
      tcvCents: 1_000_002,
      gpCents: -25_000,
      weightedTcvCents: 250_001,
    })
    expect(probe.state.closingDate).toEqual(
      new Date('2026-10-31T00:00:00.000Z')
    )
    for (const onceOnly of [
      'stage-request-claim',
      'opportunity-stage',
      'stage-audit',
      'stage-clock-stop',
      'stage-clock-start',
      'stage-request-complete',
    ]) {
      expect(
        probe.writes.filter((boundary) => boundary === onceOnly)
      ).toHaveLength(1)
    }
  })

  it.each([
    [
      'semantic audit',
      () =>
        harness({
          fromStage: 'lead',
          toStage: 'site_survey',
          accountId: null,
          auditError: new Error('injected semantic-audit failure'),
        }),
    ],
    [
      'SLA stop',
      () =>
        harness({
          fromStage: 'lead',
          toStage: 'site_survey',
          accountId: null,
          stopClockError: new Error('injected SLA-stop failure'),
        }),
    ],
    [
      'SLA start',
      () =>
        harness({
          fromStage: 'lead',
          toStage: 'site_survey',
          accountId: null,
          startClockError: new Error('injected SLA-start failure'),
        }),
    ],
    [
      'idempotency completion',
      () =>
        harness({
          fromStage: 'lead',
          toStage: 'site_survey',
          accountId: null,
          completeRequestError: new Error('injected completion failure'),
        }),
    ],
  ] as const)(
    'rolls back every non-Won effect when %s fails',
    async (_boundary, makeProbe) => {
      const probe = makeProbe()

      await expect(
        probe.candidate.transition(
          OPPORTUNITY_ID,
          {
            newStage: 'site_survey',
            tcvCents: 1_000_002,
            gpCents: -25_000,
            closingDate: '2026-10-31T00:00:00.000Z',
          },
          PRINCIPAL,
          `rollback-${_boundary}`
        )
      ).rejects.toThrow('injected')
      expect(probe.state.committed).toBe(false)
      expect(probe.state.rolledBack).toBe(true)
      expect(probe.state).toMatchObject({
        stage: 'lead',
        tcvCents: 1_000_000,
        gpCents: 250_000,
        weightedTcvCents: undefined,
      })
      expect(probe.state.closingDate).toEqual(
        new Date('2026-09-30T00:00:00.000Z')
      )
      expect(probe.writes).toEqual([])
    }
  )

  it('requires both Core rollout gates before opening a transaction', async () => {
    const stageDisabled = harness({ stageEnabled: false })
    await expect(
      stageDisabled.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'stage-disabled'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(stageDisabled.transaction).not.toHaveBeenCalled()

    const conversionDisabled = harness({ conversionEnabled: false })
    await expect(
      conversionDisabled.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'conversion-disabled'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(conversionDisabled.transaction).not.toHaveBeenCalled()
  })

  it.each(DENIED_STAGE_ROLES)(
    'denies %s membership before claiming or changing state',
    async (role) => {
      const probe = harness({
        role,
        fromStage: 'lead',
        toStage: 'site_survey',
        accountId: null,
      })
      await expect(
        probe.candidate.transition(
          OPPORTUNITY_ID,
          { newStage: 'site_survey' },
          PRINCIPAL,
          `${role}-denied`
        )
      ).rejects.toBeInstanceOf(ForbiddenException)
      expect(probe.transactionClient.select).toHaveBeenCalledOnce()
      expect(probe.transactionClient.insert).not.toHaveBeenCalled()
      expect(probe.transactionClient.update).not.toHaveBeenCalled()
      expect(probe.audit.stampActor).not.toHaveBeenCalled()
      expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
      expect(probe.conversion.convertWithinTransaction).not.toHaveBeenCalled()
      expect(probe.writes).toEqual([])
    }
  )

  it('rejects a linked Account outside the tenant before claiming or KYC work', async () => {
    const probe = harness({ accountExists: false })
    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'invalid-linked-account'
      )
    ).rejects.toThrow('Opportunity Account is not available in this tenant')
    expect(probe.transactionClient.select).toHaveBeenCalledTimes(3)
    expect(probe.transactionClient.insert).not.toHaveBeenCalled()
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.audit.writeSemantic).not.toHaveBeenCalled()
    expect(probe.conversion.convertWithinTransaction).not.toHaveBeenCalled()
    expect(probe.state.rolledBack).toBe(true)
    expect(probe.writes).toEqual([])
  })

  it.each([
    [
      'a missing canonical track',
      [{ trackType: 'financial_evaluation', status: 'approved' }] as KycTrack[],
    ],
    [
      'a non-approved canonical track',
      [
        { trackType: 'financial_evaluation', status: 'approved' },
        { trackType: 'credit_investigation', status: 'pending' },
      ] as KycTrack[],
    ],
  ])('denies %s before the stage write', async (_case, tracks) => {
    const probe = harness({
      tracks,
      accountStatus: 'approved',
    })
    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'kyc-pending'
      )
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.conversion.convertWithinTransaction).not.toHaveBeenCalled()
    expect(probe.transactionClient.select).toHaveBeenCalledTimes(5)
    expect(probe.state.rolledBack).toBe(true)
    expect(probe.writes).toEqual([])
  })

  it.each<ErpRole>(['owner', 'admin', 'sales'])(
    'commits an approved dual-track Won handoff for %s through one transaction',
    async (role) => {
      const probe = harness({ role, accountStatus: 'pending' })
      await expect(
        probe.candidate.transition(
          OPPORTUNITY_ID,
          { newStage: 'won' },
          PRINCIPAL,
          `won-${role}`
        )
      ).resolves.toEqual(probe.replay)

      expect(probe.state.committed).toBe(true)
      expect(probe.state.rolledBack).toBe(false)
      expect(probe.conversion.convertWithinTransaction).toHaveBeenCalledWith(
        probe.transactionClient,
        OPPORTUNITY_ID,
        {},
        expect.objectContaining({ role, tenantId: PRINCIPAL.tenantId }),
        `stage-${stageHash()}`
      )
      expect(probe.writes).toEqual([
        'stage-request-claim',
        'opportunity-stage',
        'stage-audit',
        'stage-clock-stop',
        'project-handoff',
        'stage-request-complete',
      ])
    }
  )

  it('preserves account-level KYC compatibility only when no tracks exist', async () => {
    const probe = harness({ tracks: [], accountStatus: 'approved' })
    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'legacy-kyc'
      )
    ).resolves.toEqual(probe.replay)
    expect(probe.transactionClient.select).toHaveBeenCalledTimes(5)
  })

  it('denies a legacy opportunity whose account KYC is not approved', async () => {
    const probe = harness({ tracks: [], accountStatus: 'pending' })
    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'legacy-kyc-pending'
      )
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.conversion.convertWithinTransaction).not.toHaveBeenCalled()
  })

  it('rolls back the stage-side writes when the Project handoff fails', async () => {
    const probe = harness({ conversionError: new Error('injected handoff failure') })
    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'handoff-failure'
      )
    ).rejects.toThrow('injected handoff failure')
    expect(probe.state.committed).toBe(false)
    expect(probe.state.rolledBack).toBe(true)
    expect(probe.writes).toEqual([])
  })

  it('replays a completed command before KYC and side-effect work', async () => {
    const probe = harness({ requestState: 'succeeded', tracks: [] })
    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'won-replay'
      )
    ).resolves.toEqual(probe.replay)
    expect(probe.transactionClient.select).toHaveBeenCalledTimes(4)
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.conversion.convertWithinTransaction).not.toHaveBeenCalled()
  })
})
