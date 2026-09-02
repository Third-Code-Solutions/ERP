import 'reflect-metadata'

import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
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

function stageHash(): string {
  return createHash('sha256')
    .update(
      `{"command":{"newStage":"won"},"opportunityId":"${OPPORTUNITY_ID}"}`
    )
    .digest('hex')
}

function selectQuery(rows: unknown[]) {
  const locked = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: locked })
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
    then: (resolve: (value: undefined) => unknown) =>
      Promise.resolve().then(() => {
        onWrite()
        return resolve(undefined)
      }),
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
  stageEnabled = true,
  conversionEnabled = true,
}: {
  role?: ErpRole
  tracks?: KycTrack[]
  accountStatus?: 'pending' | 'approved' | 'not_required'
  requestState?: 'processing' | 'succeeded'
  conversionError?: Error
  stageEnabled?: boolean
  conversionEnabled?: boolean
} = {}) {
  const replay = {
    ok: true as const,
    opportunityId: OPPORTUNITY_ID,
    tenantId: PRINCIPAL.tenantId,
    fromStage: 'contract' as const,
    toStage: 'won' as const,
    projectId: PROJECT_ID,
    checklistId: CHECKLIST_ID,
    convertedToProject: true,
  }
  const request = {
    id: REQUEST_ID,
    requestHash: requestState === 'succeeded' ? stageHash() : '',
    state: requestState,
    fromStage: 'contract',
    toStage: 'won',
    result: requestState === 'succeeded' ? replay : null,
  }
  const selects = [
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
        stage: 'contract',
        tcvCents: 1_000_000,
        accountId: ACCOUNT_ID,
        projectId: null,
        lostReason: null,
      },
    ]),
    selectQuery([request]),
    selectQuery(tracks),
    selectQuery([{ kycStatus: accountStatus }]),
  ]
  const writes: string[] = []
  const insertLedger = vi.fn().mockImplementation((values) => {
    if (request.requestHash === '') request.requestHash = values.request_hash
    return {
      onConflictDoNothing: vi.fn().mockImplementation(async () => {
        writes.push('stage-request-claim')
      }),
    }
  })
  const insert = vi.fn().mockReturnValue({ values: insertLedger })

  let updateCount = 0
  const update = vi.fn().mockImplementation(() => {
    updateCount += 1
    const label =
      updateCount === 1
        ? 'opportunity-stage'
        : updateCount === 2
          ? 'stage-clock-stop'
          : 'stage-request-complete'
    const returning = vi.fn().mockImplementation(async () => {
      writes.push(label)
      return [{ id: REQUEST_ID }]
    })
    const where = vi.fn().mockReturnValue(
      updateCount === 3
        ? { returning }
        : awaitedWrite(() => writes.push(label))
    )
    return { set: vi.fn().mockReturnValue({ where }) }
  })

  const transactionClient = {
    select: vi.fn().mockImplementation(() => selects.shift()),
    insert,
    update,
  }
  let committed = false
  let rolledBack = false
  const transaction = vi.fn(
    async (callback: (tx: typeof transactionClient) => unknown) => {
      try {
        const result = await callback(transactionClient)
        committed = true
        return result
      } catch (error) {
        rolledBack = true
        writes.length = 0
        throw error
      }
    }
  )
  const audit = {
    stampActor: vi.fn().mockResolvedValue(undefined),
    writeSemantic: vi.fn().mockImplementation(async () => {
      writes.push('stage-audit')
    }),
  }
  const conversion = {
    convertWithinTransaction: vi.fn().mockImplementation(async () => {
      if (conversionError) throw conversionError
      writes.push('project-handoff')
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
    },
  }
}

describe('Opportunity stage transition atomic authority', () => {
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

  it('denies an unauthorized membership before claiming or changing state', async () => {
    const probe = harness({ role: 'viewer' })
    await expect(
      probe.candidate.transition(
        OPPORTUNITY_ID,
        { newStage: 'won' },
        PRINCIPAL,
        'viewer-denied'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.transactionClient.select).toHaveBeenCalledOnce()
    expect(probe.transactionClient.insert).not.toHaveBeenCalled()
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.audit.stampActor).not.toHaveBeenCalled()
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
    expect(probe.transactionClient.select).toHaveBeenCalledTimes(4)
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
    expect(probe.transactionClient.select).toHaveBeenCalledTimes(3)
    expect(probe.transactionClient.update).not.toHaveBeenCalled()
    expect(probe.conversion.convertWithinTransaction).not.toHaveBeenCalled()
  })
})
