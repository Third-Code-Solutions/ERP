import 'reflect-metadata'

import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { TogalBomCommitCommand } from '@third-code-erp/shared-types'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
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

type StoredLine = {
  unit_cost_cents: number
  quantity: string
  line_total_cents: number
  parent_line_item_id: string | null
}

// The line already on the BOM: cost 1,000 and contract value 2,000.
const EXISTING_LINE: StoredLine = {
  unit_cost_cents: 1_000,
  quantity: '1',
  line_total_cents: 2_000,
  parent_line_item_id: null,
}

function harness({
  membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }],
  bom = [{ id: COMMAND.bomId, status: 'draft', totalCostCents: 1_000, tcvCents: 2_000 }],
  existingLines = [EXISTING_LINE],
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
  existingLines?: StoredLine[]
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
  // The totals read returns the lines already on the BOM plus the ones this
  // commit inserted, so the totals follow the rows rather than a fixture.
  const linesWhere = vi.fn(async (_condition: unknown) => [
    ...existingLines,
    ...insertLinesValues.mock.calls.flatMap(([values]) =>
      (values as Array<Record<string, unknown>>).map((line) => ({
        unit_cost_cents: line.unit_cost_cents,
        quantity: line.quantity_decimal,
        line_total_cents: line.line_total_cents,
        parent_line_item_id: null,
      }))
    ),
  ])
  const updateBomWhere = vi.fn().mockResolvedValue(undefined)
  const updateRequestWhere = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: request.id }]),
  })
  const transactionClient = {
    select: vi
      .fn()
      .mockReturnValueOnce({ from: membershipQuery.from })
      .mockReturnValueOnce({ from: bomQuery.from })
      .mockReturnValueOnce({ from: requestQuery.from })
      .mockReturnValueOnce({ from: vi.fn().mockReturnValue({ where: linesWhere }) }),
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
    linesWhere,
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

  it('does not write lines to an approved BOM', async () => {
    const { candidate, transactionClient, audit } = harness({
      bom: [
        {
          id: COMMAND.bomId,
          status: 'approved',
          totalCostCents: 1_000,
          tcvCents: 2_000,
        },
      ],
    })

    await expect(
      candidate.commit(COMMAND, PRINCIPAL, 'togal-approved-bom')
    ).rejects.toBeInstanceOf(ConflictException)

    // The idempotency claim is inside the transaction, but no line or audit
    // mutation may be reached for a non-draft BOM.
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
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
        quantity_decimal: '2',
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

  it('computes totals from the BOM lines, not from a stale stored total', async () => {
    const nestedMaterial: StoredLine = {
      unit_cost_cents: 50_000,
      quantity: '1',
      line_total_cents: 50_000,
      parent_line_item_id: '77777777-7777-4777-8777-777777777777',
    }
    const { candidate, audit, linesWhere } = harness({
      // The record still counts the material line that was nested later.
      bom: [{ id: COMMAND.bomId, status: 'draft', totalCostCents: 51_000, tcvCents: 52_000 }],
      existingLines: [EXISTING_LINE, nestedMaterial],
    })

    await expect(candidate.commit(COMMAND, PRINCIPAL, 'togal-stale')).resolves.toMatchObject({
      totalCostCents: 1_200,
      tcvCents: 2_260,
      gpCents: 1_060,
      gpMarginBps: 4_690,
    })
    const where = new PgDialect().sqlToQuery(linesWhere.mock.calls[0]?.[0] as SQL)
    expect(where.sql).toBe(
      '("bom_line_items"."bom_id" = $1 and "bom_line_items"."tenant_id" = $2)'
    )
    expect(where.params).toEqual([COMMAND.bomId, PRINCIPAL.tenantId])
    const auditInput = audit.writeSemantic.mock.calls[0]?.[1] as {
      diff: Record<string, unknown>
    }
    expect(auditInput.diff).toMatchObject({
      total_cost_cents: { before: 51_000, after: 1_200 },
      tcv_cents: { before: 52_000, after: 2_260 },
    })
  })

  // D-5: fractional takeoff quantities persist exactly and price half-up.
  it('commits a fractional quantity exactly without rounding it', async () => {
    const { candidate, insertLinesValues } = harness()
    const command: TogalBomCommitCommand = {
      ...COMMAND,
      proposedLines: [{ ...COMMAND.proposedLines[0]!, qty: 2.5, unitCostCents: 101 }],
    }
    await expect(
      candidate.commit(command, PRINCIPAL, 'togal-decimal')
    ).resolves.toMatchObject({
      totalCostCents: 1_253, // 1,000 + half-up(101 x 2.5 = 252.5)
      tcvCents: 2_328, // 2,000 + half-up(101 x 2.5 x 1.3 = 328.25)
    })
    expect(insertLinesValues).toHaveBeenCalledWith([
      expect.objectContaining({
        quantity_decimal: '2.5',
        unit_cost_cents: 101,
        line_total_cents: 328,
      }),
    ])
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
