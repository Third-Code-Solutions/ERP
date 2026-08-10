import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { FinanceReconciliationService } from './finance-reconciliation.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const STATEMENT_ID = '33333333-3333-4333-8333-333333333333'
const CASH_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

const ROW = {
  id: STATEMENT_ID,
  referenceNumber: 'BANK-001',
  sourceFileName: 'statement.csv',
  status: 'draft' as const,
  statementStart: new Date('2026-08-01T00:00:00.000Z'),
  statementEnd: new Date('2026-08-31T00:00:00.000Z'),
  currency: 'PHP',
  closingBalanceCents: 100_000,
  cashAccountId: CASH_ACCOUNT_ID,
  cashAccountName: 'Operating bank',
  lineCount: 2,
  matchedCount: 1,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
}

function chain<T>(result: T, whereCalls: ReturnType<typeof vi.fn>) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.from = vi.fn().mockReturnValue(query)
  query.innerJoin = vi.fn().mockReturnValue(query)
  query.leftJoin = vi.fn().mockReturnValue(query)
  query.where = vi.fn((...args: unknown[]) => {
    whereCalls(...args)
    return query
  })
  query.groupBy = vi.fn().mockReturnValue(query)
  query.orderBy = vi.fn().mockReturnValue(query)
  query.limit = vi.fn().mockReturnValue(query)
  query.then = vi.fn((resolve: (value: T) => unknown) =>
    Promise.resolve(result).then(resolve)
  )
  return query
}

function harness() {
  const whereCalls = vi.fn()
  const select = vi
    .fn()
    .mockReturnValueOnce(chain([ROW], whereCalls))
    .mockReturnValueOnce(chain([{ total: 1 }], whereCalls))
  const database = { client: { select } } as unknown as DatabaseService
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_FINANCE_RECONCILIATION_READS_ENABLED') return true
      if (key === 'ERP_FINANCE_RECONCILIATION_READS_TENANT_IDS') {
        return [TENANT_ID]
      }
      return fallback
    }),
  } as unknown as ConfigService
  return {
    service: new FinanceReconciliationService(config, database),
    select,
    whereCalls,
  }
}

describe('FinanceReconciliationService', () => {
  it('fails closed before touching the database', async () => {
    const select = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const database = { client: { select } } as unknown as DatabaseService
    const service = new FinanceReconciliationService(config, database)

    await expect(
      service.list({ limit: 500 }, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(select).not.toHaveBeenCalled()
  })

  it('returns bounded typed evidence with tenant-scoped queries', async () => {
    const probe = harness()
    const result = await probe.service.list({ limit: 500 }, PRINCIPAL)

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      total: 1,
      truncated: false,
      draftCount: 1,
      reconciledCount: 0,
      openExceptions: 1,
      channels: 1,
      rows: [
        expect.objectContaining({
          id: STATEMENT_ID,
          closingBalanceCents: 100_000,
          lineCount: 2,
          matchedCount: 1,
        }),
      ],
    })
    expect(probe.select).toHaveBeenCalledTimes(2)
    const querySql = new PgDialect().sqlToQuery(
      probe.whereCalls.mock.calls[0]?.[0]
    )
    expect(querySql.sql).toContain('"bank_statements"."tenant_id" = $1')
    expect(querySql.params).toContain(TENANT_ID)
  })
})
