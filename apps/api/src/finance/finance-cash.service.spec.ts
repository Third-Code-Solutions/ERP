import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { FinanceCashService } from './finance-cash.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const CASH_ID = '33333333-3333-4333-8333-333333333333'
const CASH_ACCOUNT_ID = '44444444-4444-4444-8444-444444444444'
const VENDOR_ID = '55555555-5555-4555-8555-555555555555'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

const ROW = {
  id: CASH_ID,
  internalNumber: 'CT-2026-000001',
  referenceNumber: 'BANK-001',
  direction: 'disbursement' as const,
  status: 'posted' as const,
  transactionDate: '2026-08-01',
  currency: 'PHP',
  amountCents: 85_000,
  postingJournalEntryId: '66666666-6666-4666-8666-666666666666',
  postedAt: new Date('2026-08-01T02:00:00.000Z'),
  cashAccountId: CASH_ACCOUNT_ID,
  cashAccountName: 'Operating bank',
  businessAccountId: null,
  businessAccountName: null,
  vendorId: VENDOR_ID,
  vendorName: 'Acme Supply',
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
  const select = vi
    .fn()
    .mockReturnValueOnce(chain([ROW], whereCalls))
    .mockReturnValueOnce(
      chain(
        [
          {
            total: 1,
            postedReceiptCents: 0,
            postedDisbursementCents: 85_000,
            draftCount: 0,
            postedCount: 1,
            reversedCount: 0,
          },
        ],
        whereCalls
      )
    )
  const database = { client: { select } } as unknown as DatabaseService
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_FINANCE_CASH_READS_ENABLED') return true
      if (key === 'ERP_FINANCE_CASH_READS_TENANT_IDS') return [TENANT_ID]
      return fallback
    }),
  } as unknown as ConfigService
  return { service: new FinanceCashService(config, database), select, whereCalls }
}

const QUERY = {
  cashAccountId: CASH_ACCOUNT_ID,
  direction: undefined,
  status: undefined,
  fromDate: '2026-08-01',
  toDate: '2026-08-31',
  page: 1,
  limit: 500,
} as const

describe('FinanceCashService', () => {
  it('fails closed before touching the database', async () => {
    const select = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const database = { client: { select } } as unknown as DatabaseService
    const service = new FinanceCashService(config, database)

    await expect(service.list(QUERY, PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(select).not.toHaveBeenCalled()
  })

  it('returns typed cash evidence and tenant-filtered aggregates', async () => {
    const probe = harness()
    const result = await probe.service.list(QUERY, PRINCIPAL)

    expect(result).toMatchObject({
      total: 1,
      postedReceiptCents: 0,
      postedDisbursementCents: 85_000,
      postedCount: 1,
      rows: [expect.objectContaining({ id: CASH_ID, amountCents: 85_000 })],
    })
    expect(probe.select).toHaveBeenCalledTimes(2)
    const querySql = new PgDialect().sqlToQuery(probe.whereCalls.mock.calls[0]?.[0])
    expect(querySql.sql).toContain('"cash_transactions"."tenant_id" = $1')
    expect(querySql.params).toContain(TENANT_ID)
    expect(querySql.params).toContain(CASH_ACCOUNT_ID)
  })
})
