import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { FinanceReceivablesService } from './finance-receivables.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const INVOICE_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const ACCOUNT_ID = '55555555-5555-4555-8555-555555555555'
const JOURNAL_ID = '66666666-6666-4666-8666-666666666666'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

const ROW = {
  id: INVOICE_ID,
  invoiceNumber: 'INV-2026-000001',
  status: 'partial_payment' as const,
  netAmountCents: 100_000,
  retentionCents: 10_000,
  withholdingTaxCents: 2_000,
  currentAllocatedCents: 25_000,
  retentionAllocatedCents: 0,
  currentOpenCents: 75_000,
  retentionOpenCents: 10_000,
  dueDate: new Date('2026-08-01T00:00:00.000Z'),
  issuedAt: new Date('2026-07-01T00:00:00.000Z'),
  issuanceJournalEntryId: JOURNAL_ID,
  projectId: PROJECT_ID,
  projectName: 'Warehouse fit-out',
  accountId: ACCOUNT_ID,
  accountName: 'Acme Holdings',
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
            totalDueCents: 75_000,
            totalRetentionCents: 10_000,
            totalWithheldCents: 2_000,
            overdueTotalCents: 75_000,
            overdueCount: 1,
          },
        ],
        whereCalls
      )
    )
  const database = { client: { select } } as unknown as DatabaseService
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_FINANCE_RECEIVABLES_READS_ENABLED') return true
      if (key === 'ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS') return [TENANT_ID]
      return fallback
    }),
  } as unknown as ConfigService
  return { service: new FinanceReceivablesService(config, database), select, whereCalls }
}

const QUERY = {
  accountId: ACCOUNT_ID,
  projectId: undefined,
  status: undefined,
  dueFrom: '2026-08-01',
  dueTo: '2026-08-31',
  page: 1,
  limit: 500,
} as const

describe('FinanceReceivablesService', () => {
  it('fails closed before touching the database', async () => {
    const select = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const database = { client: { select } } as unknown as DatabaseService
    const service = new FinanceReceivablesService(config, database)

    await expect(service.list(QUERY, PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(select).not.toHaveBeenCalled()
  })

  it('returns typed balances and tenant-filtered open invoices', async () => {
    const probe = harness()
    const result = await probe.service.list(QUERY, PRINCIPAL)

    expect(result).toMatchObject({
      total: 1,
      totalDueCents: 75_000,
      totalRetentionCents: 10_000,
      totalWithheldCents: 2_000,
      overdueTotalCents: 75_000,
      overdueCount: 1,
      rows: [expect.objectContaining({ id: INVOICE_ID, currentOpenCents: 75_000 })],
    })
    expect(probe.select).toHaveBeenCalledTimes(2)
    const querySql = new PgDialect().sqlToQuery(probe.whereCalls.mock.calls[0]?.[0])
    expect(querySql.sql).toContain('"invoices"."tenant_id" = $1')
    expect(querySql.params).toContain(TENANT_ID)
    expect(querySql.params).toContain('partial_payment')
    expect(querySql.params).toContain(ACCOUNT_ID)
  })
})
