import 'reflect-metadata'

import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { OpportunityProjectConversionService } from './opportunity-project-conversion.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'sales',
  email: 'sales@example.test',
}
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const CHECKLIST_ID = '55555555-5555-4555-8555-555555555555'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'

function conversionHash(): string {
  return createHash('sha256')
    .update(`{"command":{},"opportunityId":"${OPPORTUNITY_ID}"}`)
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

function updateChain(result: unknown[] = []) {
  const chain = {
    returning: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: undefined) => unknown) =>
      Promise.resolve(undefined).then(resolve),
  }
  return chain
}

function harness({
  membership = [
    {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    },
  ],
  opportunity = [
    {
      id: OPPORTUNITY_ID,
      tenantId: PRINCIPAL.tenantId,
      stage: 'won',
      accountId: null,
      projectId: null,
      prospectiveProjectName: 'Prospective warehouse fit-out',
      opportunityType: 'Warehouse fit-out',
    },
  ],
  request = {
    id: REQUEST_ID,
    requestHash: '',
    state: 'processing',
    result: null,
  },
  enabled = true,
  tenantIds = [PRINCIPAL.tenantId],
}: {
  membership?: unknown[]
  opportunity?: unknown[]
  request?: { id: string; requestHash: string; state: string; result: unknown }
  enabled?: boolean
  tenantIds?: string[]
} = {}) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED') return enabled
      if (key === 'ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS') return tenantIds
      return undefined
    }),
  } as unknown as ConfigService
  const selects = [
    selectQuery(membership),
    selectQuery(opportunity),
    selectQuery([request]),
    // Existing checklist lookup, active template lookup, recipients.
    selectQuery([]),
    selectQuery([
      {
        id: '77777777-7777-4777-8777-777777777777',
        items: JSON.stringify([
          { title: 'Kickoff', owner_role: 'pm', sla_days: 1 },
        ]),
      },
    ]),
    selectQuery([]),
  ]

  const insertLedger = vi.fn().mockImplementation((values) => {
    if (request.requestHash === '') request.requestHash = values.request_hash
    return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
  })
  const insertProject = {
    returning: vi.fn().mockResolvedValue([{ id: PROJECT_ID }]),
  }
  const insertProjectValues = vi.fn().mockReturnValue(insertProject)
  const insertChecklist = {
    returning: vi.fn().mockResolvedValue([{ id: CHECKLIST_ID }]),
  }
  const insertItems = {
    returning: vi
      .fn()
      .mockResolvedValue([{ id: '88888888-8888-4888-8888-888888888888', sortOrder: 0 }]),
  }

  let updateCount = 0
  const transactionClient = {
    select: vi.fn().mockImplementation(() => selects.shift()),
    insert: vi
      .fn()
      .mockReturnValueOnce({ values: insertLedger })
      .mockReturnValueOnce({ values: insertProjectValues })
      .mockReturnValueOnce({ values: vi.fn().mockReturnValue(insertChecklist) })
      .mockReturnValueOnce({ values: vi.fn().mockReturnValue(insertItems) }),
    update: vi.fn().mockImplementation(() => {
      updateCount += 1
      const isCompletion = updateCount === 2
      const chain = updateChain(isCompletion ? [{ id: REQUEST_ID }] : [])
      const where = vi.fn().mockReturnValue(chain)
      return {
        set: vi.fn().mockReturnValue({ where }),
      }
    }),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const auditMock = {
    stampActor: vi.fn(),
    writeSemantic: vi.fn(),
  }
  const candidate = new OpportunityProjectConversionService(
    config,
    { client: { transaction } } as unknown as DatabaseService,
    auditMock as unknown as AuditService
  )
  return {
    candidate,
    transaction,
    transactionClient,
    insertProjectValues,
    audit: auditMock,
    request,
  }
}

describe('Opportunity project conversion authority', () => {
  it('fails closed by default without touching the database', async () => {
    const { candidate, transaction } = harness({ enabled: false })
    await expect(
      candidate.convert(OPPORTUNITY_ID, {}, PRINCIPAL, 'conversion-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('denies a role without opportunity.convert before claiming idempotency', async () => {
    const { candidate, transactionClient, audit } = harness({
      membership: [
        {
          tenantId: PRINCIPAL.tenantId,
          role: 'viewer',
          email: 'viewer@example.test',
        },
      ],
    })
    await expect(
      candidate.convert(OPPORTUNITY_ID, {}, PRINCIPAL, 'conversion-role-denied')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('creates the project, checklist, backlink, notifications boundary, and audits atomically', async () => {
    const { candidate, transactionClient, insertProjectValues, audit } = harness()
    await expect(
      candidate.convert(OPPORTUNITY_ID, {}, PRINCIPAL, 'conversion-exact')
    ).resolves.toEqual({
      ok: true,
      opportunityId: OPPORTUNITY_ID,
      projectId: PROJECT_ID,
      checklistId: CHECKLIST_ID,
      tenantId: PRINCIPAL.tenantId,
      createdProject: true,
    })
    expect(transactionClient.insert).toHaveBeenCalledTimes(4)
    expect(insertProjectValues).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: PRINCIPAL.tenantId,
      name: 'Prospective warehouse fit-out',
    }))
    expect(transactionClient.update).toHaveBeenCalledTimes(2)
    expect(audit.writeSemantic).toHaveBeenCalledTimes(3)
    expect(audit.writeSemantic.mock.calls[0]?.[1]).toMatchObject({
      entityType: 'opportunity',
      action: 'status_change',
    })
  })

  it('replays a succeeded request without repeating side effects', async () => {
    const replay = {
      ok: true as const,
      opportunityId: OPPORTUNITY_ID,
      projectId: PROJECT_ID,
      checklistId: CHECKLIST_ID,
      tenantId: PRINCIPAL.tenantId,
      createdProject: true,
    }
    const { candidate, transactionClient, audit } = harness({
      request: {
        id: REQUEST_ID,
        requestHash: conversionHash(),
        state: 'succeeded',
        result: replay,
      },
    })
    await expect(
      candidate.convert(OPPORTUNITY_ID, {}, PRINCIPAL, 'conversion-replay')
    ).resolves.toEqual(replay)
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects reuse of an idempotency key with a different command hash', async () => {
    const { candidate } = harness({
      request: {
        id: REQUEST_ID,
        requestHash: 'a'.repeat(64),
        state: 'processing',
        result: null,
      },
    })
    await expect(
      candidate.convert(OPPORTUNITY_ID, {}, PRINCIPAL, 'conversion-conflict')
    ).rejects.toBeInstanceOf(ConflictException)
  })
})
