import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { db, type Database } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { FinanceCashService } from '../src/finance/finance-cash.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

type Row = Record<string, unknown>

async function executeRaw(
  transaction: DatabaseTransaction,
  statement: string
): Promise<Row[]> {
  return (await transaction.execute(sql.raw(statement))) as unknown as Row[]
}

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
        ) => callback(transaction)
      }

      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function'
        ? value.bind(transaction)
        : value
    },
  })

  return { client } as DatabaseService
}

async function alwaysRollback(
  callback: (transaction: DatabaseTransaction) => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await callback(transaction)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

function normalizeDirectRow(row: Row) {
  return {
    id: String(row.id),
    internalNumber: row.internalNumber ? String(row.internalNumber) : null,
    referenceNumber: String(row.referenceNumber),
    direction: row.direction,
    status: row.status,
    transactionDate: String(row.transactionDate).slice(0, 10),
    currency: String(row.currency).trim(),
    amountCents: Number(row.amountCents),
    postingJournalEntryId: row.postingJournalEntryId
      ? String(row.postingJournalEntryId)
      : null,
    postedAt: row.postedAt
      ? new Date(String(row.postedAt)).toISOString()
      : null,
    cashAccountId: String(row.cashAccountId),
    cashAccountName: String(row.cashAccountName),
    businessAccountId: row.businessAccountId
      ? String(row.businessAccountId)
      : null,
    businessAccountName: row.businessAccountName
      ? String(row.businessAccountName)
      : null,
    vendorId: row.vendorId ? String(row.vendorId) : null,
    vendorName: row.vendorName ? String(row.vendorName) : null,
  }
}

suite('cash register read projection database integration', () => {
  it('matches direct tenant-scoped rows and aggregates without leaking another tenant', async () => {
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const actorA = randomUUID()
      const actorB = randomUUID()
      const ledgerA = randomUUID()
      const ledgerB = randomUUID()
      const cashAccountA = randomUUID()
      const cashAccountB = randomUUID()
      const businessAccountA = randomUUID()
      const businessAccountB = randomUUID()
      const vendorA = randomUUID()
      const periodA = randomUUID()
      const receiptJournal = randomUUID()
      const disbursementJournal = randomUUID()
      const reversedPostingJournal = randomUUID()
      const reversalJournal = randomUUID()
      const receipt = randomUUID()
      const disbursement = randomUUID()
      const draft = randomUUID()
      const reversed = randomUUID()
      const otherTenantReceipt = randomUUID()
      const suffix = randomUUID().slice(0, 10)

      await executeRaw(transaction, `
        insert into tenants(id, name, slug)
        values
          ('${tenantA}', 'Cash Read A', 'cash-read-a-${suffix}'),
          ('${tenantB}', 'Cash Read B', 'cash-read-b-${suffix}')
      `)
      await executeRaw(transaction, `
        insert into users(id, tenant_id, email, full_name, role)
        values
          ('${actorA}', '${tenantA}', 'cash-read-a-${suffix}@probe.test', 'Cash A', 'finance'),
          ('${actorB}', '${tenantB}', 'cash-read-b-${suffix}@probe.test', 'Cash B', 'finance')
      `)
      await executeRaw(transaction, `
        insert into ledger_accounts(
          id, tenant_id, code, name, account_type, normal_balance, created_by
        )
        values
          ('${ledgerA}', '${tenantA}', '1000', 'Cash A ledger', 'asset', 'debit', '${actorA}'),
          ('${ledgerB}', '${tenantB}', '1000', 'Cash B ledger', 'asset', 'debit', '${actorB}')
      `)
      await executeRaw(transaction, `
        insert into cash_accounts(
          id, tenant_id, ledger_account_id, name, account_kind, currency, created_by
        )
        values
          ('${cashAccountA}', '${tenantA}', '${ledgerA}', 'Operating Cash A', 'bank', 'PHP', '${actorA}'),
          ('${cashAccountB}', '${tenantB}', '${ledgerB}', 'Operating Cash B', 'bank', 'PHP', '${actorB}')
      `)
      await executeRaw(transaction, `
        insert into accounts(id, tenant_id, name, created_by)
        values
          ('${businessAccountA}', '${tenantA}', 'Customer A', '${actorA}'),
          ('${businessAccountB}', '${tenantB}', 'Customer B', '${actorB}')
      `)
      await executeRaw(transaction, `
        insert into vendors(id, tenant_id, name)
        values ('${vendorA}', '${tenantA}', 'Vendor A')
      `)
      await executeRaw(transaction, `
        insert into fiscal_periods(
          id, tenant_id, name, starts_on, ends_on, status, created_by
        )
        values ('${periodA}', '${tenantA}', 'FY2026', '2026-01-01', '2026-12-31', 'open', '${actorA}')
      `)
      await executeRaw(transaction, `
        insert into journal_entries(
          id, tenant_id, fiscal_period_id, entry_number, status, source_type,
          posting_date, description, currency, reverses_entry_id, created_by,
          posted_by, posted_at
        )
        values
          ('${receiptJournal}', '${tenantA}', '${periodA}', 'JE-A-001', 'posted', 'system', '2026-08-01', 'Receipt journal', 'PHP', null, '${actorA}', '${actorA}', '2026-08-01T03:00:00Z'),
          ('${disbursementJournal}', '${tenantA}', '${periodA}', 'JE-A-002', 'posted', 'system', '2026-08-02', 'Disbursement journal', 'PHP', null, '${actorA}', '${actorA}', '2026-08-02T03:00:00Z'),
          ('${reversedPostingJournal}', '${tenantA}', '${periodA}', 'JE-A-003', 'posted', 'system', '2026-08-03', 'Reversed payment journal', 'PHP', null, '${actorA}', '${actorA}', '2026-08-03T03:00:00Z'),
          ('${reversalJournal}', '${tenantA}', '${periodA}', 'JE-A-004', 'posted', 'reversal', '2026-08-04', 'Reversal journal', 'PHP', '${reversedPostingJournal}', '${actorA}', '${actorA}', '2026-08-04T03:00:00Z')
      `)
      await executeRaw(transaction, `
        insert into cash_transactions(
          id, tenant_id, cash_account_id, direction, business_account_id,
          vendor_id, reference_number, internal_number, status,
          transaction_date, currency, amount_cents, posting_journal_entry_id,
          posted_by, posted_at, reversal_journal_entry_id, reversed_by,
          reversed_at, reversal_reason, created_by
        )
        values
          ('${receipt}', '${tenantA}', '${cashAccountA}', 'receipt', '${businessAccountA}', null, 'RCT-A-001', 'CT-A-001', 'posted', '2026-08-01', 'PHP', 12500, '${receiptJournal}', '${actorA}', '2026-08-01T03:00:00Z', null, null, null, null, '${actorA}'),
          ('${disbursement}', '${tenantA}', '${cashAccountA}', 'disbursement', null, '${vendorA}', 'DSP-A-001', 'CT-A-002', 'posted', '2026-08-02', 'PHP', 85000, '${disbursementJournal}', '${actorA}', '2026-08-02T03:00:00Z', null, null, null, null, '${actorA}'),
          ('${draft}', '${tenantA}', '${cashAccountA}', 'receipt', '${businessAccountA}', null, 'RCT-A-002', null, 'draft', '2026-08-03', 'PHP', 3000, null, null, null, null, null, null, null, '${actorA}'),
          ('${reversed}', '${tenantA}', '${cashAccountA}', 'disbursement', null, '${vendorA}', 'DSP-A-002', 'CT-A-003', 'reversed', '2026-08-04', 'PHP', 4200, '${reversedPostingJournal}', '${actorA}', '2026-08-03T03:00:00Z', '${reversalJournal}', '${actorA}', '2026-08-04T03:00:00Z', 'Duplicate payment', '${actorA}')
      `)
      await executeRaw(transaction, `
        insert into cash_transactions(
          id, tenant_id, cash_account_id, direction, business_account_id,
          vendor_id, reference_number, status, transaction_date, currency,
          amount_cents, created_by
        )
        values ('${otherTenantReceipt}', '${tenantB}', '${cashAccountB}', 'receipt',
          '${businessAccountB}',
          null, 'RCT-B-001', 'draft', '2026-08-05', 'PHP', 999999, '${actorB}')
      `)

      const principal: ErpPrincipal = {
        userId: actorA,
        tenantId: tenantA,
        role: 'finance',
        email: `cash-read-a-${suffix}@probe.test`,
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_FINANCE_CASH_READS_ENABLED') return true
          if (key === 'ERP_FINANCE_CASH_READS_TENANT_IDS') return [tenantA]
          return fallback
        }),
      }
      const service = new FinanceCashService(
        config as never,
        transactionBoundDatabase(transaction)
      )
      const query = {
        cashAccountId: undefined,
        direction: undefined,
        status: undefined,
        fromDate: undefined,
        toDate: undefined,
        page: 1,
        limit: 500,
      } as const

      const result = await service.list(query, principal)
      const directRows = (await executeRaw(transaction, `
        select
          cash_transaction.id,
          cash_transaction.internal_number as "internalNumber",
          cash_transaction.reference_number as "referenceNumber",
          cash_transaction.direction,
          cash_transaction.status,
          cash_transaction.transaction_date as "transactionDate",
          cash_transaction.currency,
          cash_transaction.amount_cents as "amountCents",
          cash_transaction.posting_journal_entry_id as "postingJournalEntryId",
          cash_transaction.posted_at as "postedAt",
          cash_account.id as "cashAccountId",
          cash_account.name as "cashAccountName",
          account.id as "businessAccountId",
          account.name as "businessAccountName",
          vendor.id as "vendorId",
          vendor.name as "vendorName"
        from cash_transactions cash_transaction
        join cash_accounts cash_account
          on cash_account.id = cash_transaction.cash_account_id
         and cash_account.tenant_id = cash_transaction.tenant_id
        left join accounts account
          on account.id = cash_transaction.business_account_id
         and account.tenant_id = cash_transaction.tenant_id
        left join vendors vendor
          on vendor.id = cash_transaction.vendor_id
         and vendor.tenant_id = cash_transaction.tenant_id
        where cash_transaction.tenant_id = '${tenantA}'
        order by cash_transaction.transaction_date desc, cash_transaction.created_at desc
      `)) as Row[]
      const directAggregate = (await executeRaw(transaction, `
        select
          count(*)::int as total,
          coalesce(sum(case when status = 'posted' and direction = 'receipt' then amount_cents else 0 end), 0) as "postedReceiptCents",
          coalesce(sum(case when status = 'posted' and direction = 'disbursement' then amount_cents else 0 end), 0) as "postedDisbursementCents",
          count(*) filter (where status = 'draft')::int as "draftCount",
          count(*) filter (where status = 'posted')::int as "postedCount",
          count(*) filter (where status = 'reversed')::int as "reversedCount"
        from cash_transactions
        where tenant_id = '${tenantA}'
      `)) as Row[]

      expect(result.tenantId).toBe(tenantA)
      expect(result.rows).toEqual(directRows.map(normalizeDirectRow))
      expect(result).toMatchObject({
        total: 4,
        postedReceiptCents: 12500,
        postedDisbursementCents: 85000,
        draftCount: 1,
        postedCount: 2,
        reversedCount: 1,
        totalPages: 1,
      })
      expect(directAggregate[0]).toMatchObject({
        total: 4,
        postedReceiptCents: '12500',
        postedDisbursementCents: '85000',
        draftCount: 1,
        postedCount: 2,
        reversedCount: 1,
      })
      expect(result.rows.every((row) => row.id !== otherTenantReceipt)).toBe(true)

      const receiptResult = await service.list(
        { ...query, direction: 'receipt', fromDate: '2026-08-01', toDate: '2026-08-03' },
        principal
      )
      expect(receiptResult.rows.map((row) => row.id)).toEqual([draft, receipt])
      expect(receiptResult.total).toBe(2)
    })
  })
})
