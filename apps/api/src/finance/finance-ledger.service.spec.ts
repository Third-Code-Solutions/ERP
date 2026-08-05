import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { FinanceLedgerService } from './finance-ledger.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ENTRY_ID = '33333333-3333-4333-8333-333333333333'
const LINE_ID = '44444444-4444-4444-8444-444444444444'
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

const LEDGER_ROW = {
  id: LINE_ID,
  entryId: ENTRY_ID,
  entryNumber: 'JE-2026-000001',
  postingDate: '2026-01-01',
  entryDescription: 'Concrete purchase',
  accountCode: '5100',
  accountName: 'Materials',
  projectId: null,
  projectName: null,
  customerId: null,
  customerName: null,
  vendorId: ACCOUNT_ID,
  vendorName: 'Vendor',
  lineDescription: null,
  debitCents: 100,
  creditCents: 0,
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
  query.orderBy = vi.fn().mockReturnValue(query)
  query.limit = vi.fn().mockReturnValue(query)
  query.offset = vi.fn().mockReturnValue(query)
  query.then = vi.fn((resolve: (value: T) => unknown) =>
    Promise.resolve(result).then(resolve)
  )
  return query
}

function harness() {
  const whereCalls = vi.fn()
  const select = vi.fn()
  select
    .mockReturnValueOnce(
      chain([LEDGER_ROW], whereCalls)
    )
    .mockReturnValueOnce(chain([{ count: 1 }], whereCalls))
    .mockReturnValueOnce(
      chain([{ debit: 100, credit: 0 }], whereCalls)
    )
    .mockReturnValueOnce(
      chain([{ id: ACCOUNT_ID, code: '5100', name: 'Materials' }], whereCalls)
    )
    .mockReturnValueOnce(chain([{ id: ACCOUNT_ID, name: 'Customer' }], whereCalls))
    .mockReturnValueOnce(chain([{ id: ACCOUNT_ID, name: 'Vendor' }], whereCalls))

  const database = { client: { select } } as unknown as DatabaseService
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_FINANCE_LEDGER_READS_ENABLED') return true
      if (key === 'ERP_FINANCE_LEDGER_READS_TENANT_IDS') return [TENANT_ID]
      return fallback
    }),
  } as unknown as ConfigService
  return {
    service: new FinanceLedgerService(config, database),
    select,
    whereCalls,
  }
}

const QUERY = {
  accountId: ACCOUNT_ID,
  customerId: undefined,
  vendorId: undefined,
  projectId: undefined,
  from: '2026-01-01',
  to: '2026-01-31',
  page: 1,
  limit: 500,
} as const

describe('FinanceLedgerService', () => {
  it('fails closed before touching the database', async () => {
    const select = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const database = { client: { select } } as unknown as DatabaseService
    const service = new FinanceLedgerService(config, database)

    await expect(service.list(QUERY, PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(select).not.toHaveBeenCalled()
  })

  it('returns typed totals, options, and tenant-filtered posted rows', async () => {
    const probe = harness()
    const result = await probe.service.list(QUERY, PRINCIPAL)

    expect(result).toMatchObject({
      total: 1,
      totalDebitCents: 100,
      totalCreditCents: 0,
      totalPages: 1,
      rows: [expect.objectContaining({ id: LINE_ID, entryId: ENTRY_ID })],
      ledgerAccounts: [{ id: ACCOUNT_ID, code: '5100', name: 'Materials' }],
    })
    expect(probe.select).toHaveBeenCalledTimes(6)
    const firstWhere = probe.whereCalls.mock.calls[0]?.[0]
    const querySql = new PgDialect().sqlToQuery(firstWhere)
    expect(querySql.sql).toContain('"journal_lines"."tenant_id" = $1')
    expect(querySql.params).toContain(TENANT_ID)
    expect(querySql.params).toContain('posted')
    expect(querySql.params).toContain(ACCOUNT_ID)
  })
})
