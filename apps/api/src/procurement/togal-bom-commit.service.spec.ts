import 'reflect-metadata'

import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { TogalBomCommitCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { TogalBomCommitService } from './togal-bom-commit.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'commercial',
  email: 'commercial@example.test',
}

const COMMAND: TogalBomCommitCommand = {
  bomId: '33333333-3333-4333-8333-333333333333',
  proposedLines: [
    {
      materialItemId: null,
      code: 'CONC-01',
      description: 'Concrete',
      unit: 'm3',
      qty: 2,
      unitCostCents: 100,
      markupBps: 3_000,
      vendorId: null,
      sourceLabel: 'Concrete',
      notes: null,
    },
  ],
  markupBps: 3_000,
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

const COMMAND_HASH = createHash('sha256')
  .update(canonicalJson(COMMAND))
  .digest('hex')

function selectQuery(rows: unknown[]) {
  const rowLock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: rowLock })
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

function harness({
  membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }],
  bom = [{ id: COMMAND.bomId, status: 'draft', totalCostCents: 1_000, tcvCents: 2_000 }],
  request = {
    id: '44444444-4444-4444-8444-444444444444',
    requestHash: '',
    state: 'processing',
    result: null,
  },
  enabled = true,
  tenantIds = [PRINCIPAL.tenantId],
}: {
  membership?: unknown[]
  bom?: unknown[]
  request?: { id: string; requestHash: string; state: string; result: unknown }
  enabled?: boolean
  tenantIds?: string[]
} = {}) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED') return enabled
      if (key === 'ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS') return tenantIds
      return undefined
    }),
  } as unknown as ConfigService
  const membershipQuery = selectQuery(membership)
  const bomQuery = selectQuery(bom)
  const requestQuery = selectQuery([request])
  const insertRequestValues = vi.fn().mockImplementation((values) => {
    if (request.state === 'processing' && request.requestHash === '') {
      request.requestHash = values.request_hash
    }
    return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
  })
  const insertLinesValues = vi.fn().mockResolvedValue(undefined)
  const updateBomWhere = vi.fn().mockResolvedValue(undefined)
  const updateRequestWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: request.id }]),
  })
  const transactionClient = {
    select: vi
      .fn()
      .mockReturnValueOnce({ from: membershipQuery.from })
      .mockReturnValueOnce({ from: bomQuery.from })
      .mockReturnValueOnce({ from: requestQuery.from }),
    insert: vi
      .fn()
      .mockReturnValueOnce({ values: insertRequestValues })
      .mockReturnValueOnce({ values: insertLinesValues }),
    update: vi
      .fn()
      .mockReturnValueOnce({ set: vi.fn().mockReturnValue({ where: updateBomWhere }) })
      .mockReturnValueOnce({ set: vi.fn().mockReturnValue({ where: updateRequestWhere }) }),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const auditMock = {
    stampActor: vi.fn(),
    writeSemantic: vi.fn(),
  }
  const audit = auditMock as unknown as AuditService
  const candidate = new TogalBomCommitService(
    config,
    { client: { transaction } } as unknown as DatabaseService,
    audit
  )
  return {
    candidate,
    transaction,
    transactionClient,
    audit: auditMock,
    request,
    insertLinesValues,
  }
}

describe('Togal BOM commit authority', () => {
  it('fails closed by default without touching the database', async () => {
    const { candidate, transaction } = harness({ enabled: false })
    await expect(
      candidate.commit(COMMAND, PRINCIPAL, 'togal-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('denies a role without bom.generate before claiming idempotency', async () => {
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
      candidate.commit(COMMAND, PRINCIPAL, 'togal-role-denied')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('commits exact totals, tenant-scoped rows, and in-transaction audit', async () => {
    const {
      candidate,
      transaction,
      transactionClient,
      audit,
      insertLinesValues,
    } = harness()
    await expect(
      candidate.commit(COMMAND, PRINCIPAL, 'togal-exact')
    ).resolves.toEqual({
      ok: true,
      linesCreated: 1,
      bomId: COMMAND.bomId,
      tenantId: PRINCIPAL.tenantId,
      totalCostCents: 1_200,
      tcvCents: 2_260,
      gpCents: 1_060,
      gpMarginBps: 4_690,
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionClient.insert).toHaveBeenCalledTimes(2)
    expect(insertLinesValues).toHaveBeenCalledWith([
      expect.objectContaining({
        tenant_id: PRINCIPAL.tenantId,
        bom_id: COMMAND.bomId,
        quantity: 2,
        unit_cost_cents: 100,
        line_total_cents: 260,
      }),
    ])
    expect(audit.writeSemantic).toHaveBeenCalledOnce()
    const auditInput = audit.writeSemantic.mock.calls[0]?.[1] as {
      diff: Record<string, unknown>
    }
    expect(auditInput.diff).toMatchObject({
      lines_added: 1,
      source: 'togal_commit_nest_authority',
    })
    expect(auditInput.diff).not.toHaveProperty('description')
    expect(auditInput.diff.idempotency_key_hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('replays the exact result without inserting lines or writing audit twice', async () => {
    const replay = {
      ok: true as const,
      linesCreated: 1,
      bomId: COMMAND.bomId,
      tenantId: PRINCIPAL.tenantId,
      totalCostCents: 1_200,
      tcvCents: 2_260,
      gpCents: 1_060,
      gpMarginBps: 4_690,
    }
    const { candidate, transactionClient, audit } = harness({
      request: {
        id: '55555555-5555-4555-8555-555555555555',
        requestHash: COMMAND_HASH,
        state: 'succeeded',
        result: replay,
      },
    })
    await expect(
      candidate.commit(COMMAND, PRINCIPAL, 'togal-replay')
    ).resolves.toEqual(replay)
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects reuse of a key with a different command hash', async () => {
    const { candidate } = harness({
      request: {
        id: '66666666-6666-4666-8666-666666666666',
        requestHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        state: 'processing',
        result: null,
      },
    })
    await expect(
      candidate.commit(COMMAND, PRINCIPAL, 'togal-conflict')
    ).rejects.toBeInstanceOf(ConflictException)
  })
})
