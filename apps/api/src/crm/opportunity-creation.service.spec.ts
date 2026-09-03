import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  accounts,
  opportunities,
  opportunityStageTransitionRequests,
  projects,
  users,
} from '@third-code-erp/database/schema'
import type {
  ErpRole,
  OpportunityCreationCommand,
  OpportunityCreationResult,
} from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { OpportunityCreationService } from './opportunity-creation.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'
const OPPORTUNITY_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'sales',
  email: 'sales@example.test',
}
const COMMAND: OpportunityCreationCommand = {
  projectId: PROJECT_ID,
  stage: 'opportunity_creation',
  tcvCents: '10005',
  gpCents: '-2000',
  closingDate: '2026-09-03T00:00:00+08:00',
  areaSqm: 120,
  opportunityType: 'Fit-out',
  remarks: 'Project-detail workflow',
}

type RequestRecord = {
  id: string
  opportunityId: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: OpportunityCreationResult | null
}

type CreatedRow = {
  id: string
  tenant_id: string
  project_id: string
  account_id: string | null
  rep_id: string
  stage: 'opportunity_creation'
  probability: 10
  tcv_cents: number
  gp_cents: number
  weighted_tcv_cents: number
  closing_date: Date | null
  area_sqm: number | null
  opportunity_type: string | null
  remarks: string | null
  created_at: Date
}

function harness({
  role = 'sales',
  membershipExists = true,
  projectExists = true,
  projectAccountId = ACCOUNT_ID,
  accountExists = true,
  writesEnabled = true,
  failAuditOnce = false,
}: {
  role?: ErpRole
  membershipExists?: boolean
  projectExists?: boolean
  projectAccountId?: string | null
  accountExists?: boolean
  writesEnabled?: boolean
  failAuditOnce?: boolean
} = {}) {
  const committedRows: CreatedRow[] = []
  let requestRecord: RequestRecord | null = null
  let nextOpportunity = 0
  let auditFailures = failAuditOnce ? 1 : 0
  const writes: string[] = []
  let transactionWrites: string[] = []

  const rowsFor = (table: unknown): object[] => {
    if (table === users) {
      return membershipExists
        ? [{ tenantId: TENANT_ID, role, email: `${role}@example.test` }]
        : []
    }
    if (table === projects) {
      return projectExists
        ? [{ id: PROJECT_ID, accountId: projectAccountId }]
        : []
    }
    if (table === accounts) {
      return accountExists ? [{ id: ACCOUNT_ID }] : []
    }
    if (table === opportunityStageTransitionRequests) {
      return requestRecord ? [requestRecord] : []
    }
    return []
  }

  const select = vi.fn().mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => ({
        limit: () => ({
          for: async () => rowsFor(table),
        }),
      }),
    }),
  }))

  const insert = vi.fn().mockImplementation((table: unknown) => ({
    values: (payload: Record<string, unknown>) => {
      if (table === opportunities) {
        return {
          returning: async () => {
            const tcvCents = payload.tcv_cents
            const gpCents = payload.gp_cents
            const weightedTcvCents = payload.weighted_tcv_cents
            const closingDate = payload.closing_date
            if (
              typeof tcvCents !== 'number' ||
              typeof gpCents !== 'number' ||
              typeof weightedTcvCents !== 'number' ||
              !(closingDate instanceof Date)
            ) {
              throw new TypeError('Unexpected Opportunity insert payload')
            }
            nextOpportunity += 1
            const row: CreatedRow = {
              id:
                nextOpportunity === 1
                  ? OPPORTUNITY_ID
                  : `55555555-5555-4555-8555-${String(nextOpportunity).padStart(12, '0')}`,
              tenant_id: TENANT_ID,
              project_id: PROJECT_ID,
              account_id: projectAccountId,
              rep_id: USER_ID,
              stage: 'opportunity_creation',
              probability: 10,
              tcv_cents: tcvCents,
              gp_cents: gpCents,
              weighted_tcv_cents: weightedTcvCents,
              closing_date: closingDate,
              area_sqm: COMMAND.areaSqm ?? null,
              opportunity_type: COMMAND.opportunityType ?? null,
              remarks: COMMAND.remarks ?? null,
              created_at: new Date('2026-09-03T01:00:00.000Z'),
            }
            committedRows.push(row)
            transactionWrites.push('opportunity-insert')
            return [row]
          },
        }
      }
      return {
        onConflictDoNothing: async () => {
          if (!requestRecord) {
            requestRecord = {
              id: REQUEST_ID,
              opportunityId: String(payload.opportunity_id),
              requestHash: String(payload.request_hash),
              state: 'processing',
              result: null,
            }
            transactionWrites.push('request-claim')
          }
        },
      }
    },
  }))

  const update = vi.fn().mockImplementation(() => ({
    set: (payload: {
      state: 'succeeded'
      result: OpportunityCreationResult
    }) => ({
      where: () => ({
        returning: async () => {
          if (!requestRecord || requestRecord.state !== 'processing') return []
          requestRecord.state = payload.state
          requestRecord.result = payload.result
          transactionWrites.push('request-complete')
          return [{ id: REQUEST_ID }]
        },
      }),
    }),
  }))

  const remove = vi.fn().mockImplementation(() => ({
    where: async () => {
      committedRows.pop()
      transactionWrites.push('provisional-delete')
    },
  }))

  const transactionClient = { select, insert, update, delete: remove }
  let transactionTail = Promise.resolve()
  const transaction = vi.fn(
    (callback: (client: typeof transactionClient) => Promise<unknown>) => {
      const execute = async () => {
        const rowSnapshot = [...committedRows]
        const requestSnapshot = requestRecord
          ? { ...requestRecord }
          : null
        transactionWrites = []
        try {
          const result = await callback(transactionClient)
          writes.push(...transactionWrites)
          return result
        } catch (error) {
          committedRows.splice(0, committedRows.length, ...rowSnapshot)
          requestRecord = requestSnapshot
          throw error
        } finally {
          transactionWrites = []
        }
      }
      const result = transactionTail.then(execute)
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
      if (auditFailures > 0) {
        auditFailures -= 1
        throw new Error('injected audit failure')
      }
      transactionWrites.push('semantic-audit')
    }),
  }
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => {
      if (key === 'ERP_OPPORTUNITY_STAGE_WRITES_ENABLED') return writesEnabled
      if (key === 'ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS') return [TENANT_ID]
      return fallback
    }),
  }
  const service = new OpportunityCreationService(
    config as unknown as ConfigService,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService
  )
  return {
    service,
    transaction,
    transactionClient,
    audit,
    committedRows,
    writes,
    request: () => requestRecord,
  }
}

describe('Opportunity creation atomic authority', () => {
  it.each<ErpRole>(['owner', 'admin', 'sales'])(
    'allows current %s membership to create once with exact commercial evidence',
    async (role) => {
      const probe = harness({ role })

      await expect(
        probe.service.create(COMMAND, PRINCIPAL, `create-${role}`)
      ).resolves.toEqual({
        ok: true,
        opportunityId: OPPORTUNITY_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        accountId: ACCOUNT_ID,
        repId: USER_ID,
        stage: 'opportunity_creation',
        probability: 10,
        tcvCents: '10005',
        gpCents: '-2000',
        weightedTcvCents: '1001',
        closingDate: '2026-09-02T16:00:00.000Z',
        areaSqm: 120,
        opportunityType: 'Fit-out',
        remarks: 'Project-detail workflow',
        createdAt: '2026-09-03T01:00:00.000Z',
      })
      expect(probe.writes).toEqual([
        'opportunity-insert',
        'request-claim',
        'semantic-audit',
        'request-complete',
      ])
      expect(probe.audit.writeSemantic).toHaveBeenCalledWith(
        probe.transactionClient,
        expect.objectContaining({
          entityType: 'opportunity',
          entityId: OPPORTUNITY_ID,
          action: 'create',
          diff: expect.objectContaining({
            tcv_centavos: '10005',
            gp_centavos: '-2000',
            weighted_tcv_centavos: '1001',
          }),
        })
      )
    }
  )

  it.each<ErpRole>([
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
  ])('denies current %s membership before any write', async (role) => {
    const probe = harness({ role })
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, `create-${role}`)
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.committedRows).toHaveLength(0)
    expect(probe.audit.stampActor).not.toHaveBeenCalled()
  })

  it('denies a stale principal with no current tenant membership', async () => {
    const probe = harness({ membershipExists: false })
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'no-membership')
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('conceals a Project outside the current tenant', async () => {
    const probe = harness({ projectExists: false })
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'foreign-project')
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(probe.committedRows).toHaveLength(0)
  })

  it('rejects a Project whose linked Account is not tenant-resolved', async () => {
    const probe = harness({ accountExists: false })
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'foreign-account')
    ).rejects.toBeInstanceOf(ConflictException)
    expect(probe.committedRows).toHaveLength(0)
  })

  it('supports a legacy accountless Project only at the safe initial stage', async () => {
    const probe = harness({ projectAccountId: null })
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'legacy-project')
    ).resolves.toMatchObject({
      accountId: null,
      stage: 'opportunity_creation',
    })
  })

  it('validates unsafe money, dates, and stages before opening a transaction', async () => {
    const probe = harness()
    for (const command of [
      { ...COMMAND, tcvCents: '9007199254740992' },
      { ...COMMAND, gpCents: '-9007199254740992' },
      { ...COMMAND, closingDate: '2026-09-03' },
      { ...COMMAND, stage: 'design' },
    ]) {
      await expect(
        probe.service.create(
          command,
          PRINCIPAL,
          'invalid-command'
        )
      ).rejects.toThrow()
    }
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('rolls back row, ledger, and audit together and permits a clean retry', async () => {
    const probe = harness({ failAuditOnce: true })
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'audit-rollback')
    ).rejects.toThrow('injected audit failure')
    expect(probe.committedRows).toHaveLength(0)
    expect(probe.request()).toBeNull()

    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'audit-rollback')
    ).resolves.toMatchObject({
      projectId: PROJECT_ID,
      stage: 'opportunity_creation',
    })
    expect(probe.committedRows).toHaveLength(1)
  })

  it('replays the same key and rejects reuse with a different command', async () => {
    const probe = harness()
    const first = await probe.service.create(COMMAND, PRINCIPAL, 'replay')
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'replay')
    ).resolves.toEqual(first)
    expect(probe.committedRows).toHaveLength(1)
    expect(probe.audit.writeSemantic).toHaveBeenCalledOnce()

    await expect(
      probe.service.create(
        { ...COMMAND, tcvCents: '10006' },
        PRINCIPAL,
        'replay'
      )
    ).rejects.toThrow(
      'Idempotency key was already used with a different Opportunity command'
    )
  })

  it('serializes same-key concurrent calls into one row, audit, and result', async () => {
    const probe = harness()
    const execute = () =>
      probe.service.create(COMMAND, PRINCIPAL, 'concurrent-create')
    const [first, retry] = await Promise.all([execute(), execute()])
    expect(retry).toEqual(first)
    expect(probe.committedRows).toHaveLength(1)
    expect(probe.audit.writeSemantic).toHaveBeenCalledOnce()
  })

  it('keeps creation fail closed outside the existing tenant canary', async () => {
    const probe = harness({ writesEnabled: false })
    await expect(
      probe.service.create(COMMAND, PRINCIPAL, 'disabled')
    ).rejects.toMatchObject({ status: 503 })
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
