import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { FinancePayablesService } from './finance-payables.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const BILL_ID = '33333333-3333-4333-8333-333333333333'
const VENDOR_ID = '44444444-4444-4444-8444-444444444444'
const PO_ID = '55555555-5555-4555-8555-555555555555'
const PROJECT_ID = '66666666-6666-4666-8666-666666666666'
const JOURNAL_ID = '77777777-7777-4777-8777-777777777777'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

const ROW = {
  id: BILL_ID,
  vendorBillNumber: 'V-2026-001',
  internalNumber: 'SBL-2026-000001',
  status: 'posted' as const,
  billDate: '2026-07-01',
  dueDate: '2026-08-01',
  subtotalCents: 100_000,
  inputVatCents: 12_000,
  withholdingTaxCents: 2_000,
  totalPayableCents: 110_000,
  paidCents: 25_000,
  openCents: 85_000,
  postedAt: new Date('2026-07-02T00:00:00.000Z'),
  postingJournalEntryId: JOURNAL_ID,
  vendorId: VENDOR_ID,
  vendorName: 'Acme Supply',
  purchaseOrderId: PO_ID,
  purchaseOrderNumber: 'PO-2026-001',
  projectId: PROJECT_ID,
  projectName: 'Warehouse fit-out',
}

function chain<T>(result: T, whereCalls: ReturnType<typeof vi.fn>) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.from = vi.fn().mockReturnValue(query)
  query.innerJoin = vi.fn().mockReturnValue(query)
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
            totalPayableCents: 110_000,
            totalPaidCents: 25_000,
            totalOpenCents: 85_000,
            overdueOpenCents: 85_000,
            overdueCount: 1,
            draftCount: 0,
            postedOpenCount: 1,
            agingCurrentCents: 0,
            aging1To30Cents: 0,
            aging31To60Cents: 85_000,
            aging61To90Cents: 0,
            aging90PlusCents: 0,
          },
        ],
        whereCalls
      )
    )
  const database = { client: { select } } as unknown as DatabaseService
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_FINANCE_PAYABLES_READS_ENABLED') return true
      if (key === 'ERP_FINANCE_PAYABLES_READS_TENANT_IDS') return [TENANT_ID]
      return fallback
    }),
  } as unknown as ConfigService
  return { service: new FinancePayablesService(config, database), select, whereCalls }
}

const QUERY = {
  vendorId: VENDOR_ID,
  projectId: undefined,
  status: undefined,
  dueFrom: '2026-08-01',
  dueTo: '2026-08-31',
  page: 1,
  limit: 500,
} as const

describe('FinancePayablesService', () => {
  it('fails closed before touching the database', async () => {
    const select = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const database = { client: { select } } as unknown as DatabaseService
    const service = new FinancePayablesService(config, database)

    await expect(service.list(QUERY, PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(select).not.toHaveBeenCalled()
  })

  it('returns typed balances and tenant-filtered supplier bills', async () => {
    const probe = harness()
    const result = await probe.service.list(QUERY, PRINCIPAL)

    expect(result).toMatchObject({
      total: 1,
      totalOpenCents: 85_000,
      overdueOpenCents: 85_000,
      overdueCount: 1,
      rows: [expect.objectContaining({ id: BILL_ID, openCents: 85_000 })],
    })
    expect(probe.select).toHaveBeenCalledTimes(2)
    const querySql = new PgDialect().sqlToQuery(probe.whereCalls.mock.calls[0]?.[0])
    expect(querySql.sql).toContain('"supplier_bills"."tenant_id" = $1')
    expect(querySql.params).toContain(TENANT_ID)
    expect(querySql.params).toContain(VENDOR_ID)
  })
})
