import { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Call {
  method: string
  args: unknown[]
}

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

import {
  accounts,
  journalEntries,
  journalLines,
  ledgerAccounts,
  projects,
  vendors,
} from '@third-code-erp/database/schema'

import {
  findFiscalPeriod,
  getLedgerExportRows,
  getPayableAgingRows,
  getReceivableAgingRows,
  getTrialBalance,
} from './report-queries'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const PERIOD_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'

/** A drizzle-like fluent chain that records every call and resolves to `rows`. */
function queryChain(rows: unknown[], calls: Call[]): object {
  const chain: object = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return (
            resolve: (value: unknown) => unknown,
            reject: (reason: unknown) => unknown
          ) => Promise.resolve(rows).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(property), args })
          return chain
        }
      },
    }
  )
  return chain
}

/** Queue one result set per db.select() call, in call order; returns each query's recorded calls. */
function queueSelects(...resultSets: unknown[][]): Call[][] {
  const recorded = resultSets.map((): Call[] => [])
  resultSets.forEach((rows, index) => {
    const calls = recorded[index] ?? []
    mocks.select.mockImplementationOnce(() => queryChain(rows, calls))
  })
  return recorded
}

function compile(expression: unknown): { sql: string; params: unknown[] } {
  if (!(expression instanceof SQL)) throw new Error('Expected a SQL expression')
  return new PgDialect().sqlToQuery(expression)
}

function argOf(calls: Call[], method: string, position = 0): unknown {
  const call = calls.find((candidate) => candidate.method === method)
  if (!call) throw new Error(`Expected a .${method}() call`)
  return call.args[position]
}

describe('finance report queries', () => {
  beforeEach(() => {
    mocks.select.mockReset()
  })

  describe('getTrialBalance', () => {
    it('sums only posted lines for the session tenant up to the as-of date, grouped by account', async () => {
      const [accountCalls, sumCalls] = queueSelects(
        [
          {
            id: 'cash',
            code: '1000',
            name: 'Cash',
            accountType: 'asset',
            normalBalance: 'debit',
            isActive: true,
          },
          {
            id: 'rev',
            code: '4000',
            name: 'Revenue',
            accountType: 'income',
            normalBalance: 'credit',
            isActive: true,
          },
        ],
        [
          { accountId: 'cash', debitCents: '150000', creditCents: '50000' },
          { accountId: 'rev', debitCents: '0', creditCents: '100000' },
        ]
      )

      const result = await getTrialBalance(TENANT_ID, {
        from: null,
        to: '2026-11-17',
      })

      const accountWhere = compile(argOf(accountCalls ?? [], 'where'))
      expect(accountWhere.sql).toContain('"ledger_accounts"."tenant_id" = $1')
      expect(accountWhere.params).toEqual([TENANT_ID])

      const sumWhere = compile(argOf(sumCalls ?? [], 'where'))
      expect(sumWhere.sql).toContain('"journal_lines"."tenant_id" = $1')
      expect(sumWhere.sql).toContain('"journal_entries"."tenant_id" = $2')
      expect(sumWhere.sql).toContain('"journal_entries"."status" = $3')
      expect(sumWhere.sql).toContain('"journal_entries"."posting_date" <= $4')
      expect(sumWhere.sql).not.toContain('>=')
      expect(sumWhere.sql).not.toContain('source_type')
      expect(sumWhere.params).toEqual([
        TENANT_ID,
        TENANT_ID,
        'posted',
        '2026-11-17',
      ])
      expect(argOf(sumCalls ?? [], 'groupBy')).toBe(journalLines.ledger_account_id)

      const joinCondition = compile(argOf(sumCalls ?? [], 'innerJoin', 1))
      expect(joinCondition.sql).toContain('"journal_entries"."tenant_id" = $')
      expect(joinCondition.params).toEqual([TENANT_ID])

      expect(result.totalDebitCents).toBe(150_000)
      expect(result.totalCreditCents).toBe(150_000)
      expect(result.isBalanced).toBe(true)
      expect(result.rows.map((row) => row.balanceCents)).toEqual([
        100_000, 100_000,
      ])
    })

    it('adds the period start as an inclusive lower bound', async () => {
      const [, sumCalls] = queueSelects([], [])

      await getTrialBalance(TENANT_ID, { from: '2026-11-01', to: '2026-11-17' })

      const where = compile(argOf(sumCalls ?? [], 'where'))
      expect(where.sql).toContain('"journal_entries"."posting_date" >= $5')
      expect(where.params).toEqual([
        TENANT_ID,
        TENANT_ID,
        'posted',
        '2026-11-17',
        '2026-11-01',
      ])
    })
  })

  describe('findFiscalPeriod', () => {
    it('looks the period up by id inside the session tenant only', async () => {
      const [calls] = queueSelects([
        { id: PERIOD_ID, name: 'Nov 2026', startsOn: '2026-11-01', endsOn: '2026-11-30' },
      ])

      const period = await findFiscalPeriod(TENANT_ID, PERIOD_ID)

      const where = compile(argOf(calls ?? [], 'where'))
      expect(where.sql).toContain('"fiscal_periods"."tenant_id" = $1')
      expect(where.sql).toContain('"fiscal_periods"."id" = $2')
      expect(where.params).toEqual([TENANT_ID, PERIOD_ID])
      expect(period?.name).toBe('Nov 2026')
    })

    it('returns null when the period is not in this tenant', async () => {
      queueSelects([])

      await expect(findFiscalPeriod(TENANT_ID, PERIOD_ID)).resolves.toBeNull()
    })
  })

  describe('getLedgerExportRows', () => {
    it('binds every join to the session tenant, filters posted entries and bounds the row count', async () => {
      const [calls] = queueSelects([
        {
          postingDate: '2026-11-02',
          entryNumber: 'JE-000001',
          sourceType: 'manual',
          entryDescription: 'Opening entry',
          accountCode: '1000',
          accountName: 'Cash',
          projectName: null,
          customerName: null,
          vendorName: 'Supplier, Inc.',
          lineDescription: null,
          debitCents: 5_000,
          creditCents: 0,
        },
        {
          postingDate: '2026-11-03',
          entryNumber: 'JE-000002',
          sourceType: 'reversal',
          entryDescription: 'Reversal',
          accountCode: '1000',
          accountName: 'Cash',
          projectName: 'Tower A',
          customerName: 'Metro',
          vendorName: null,
          lineDescription: 'Line text',
          debitCents: 0,
          creditCents: 5_000,
        },
      ])

      const rows = await getLedgerExportRows(
        TENANT_ID,
        { accountId: ACCOUNT_ID, from: '2026-11-01', to: '2026-11-30' },
        50_001
      )

      expect(calls?.filter((call) => call.method.endsWith('Join'))).toHaveLength(5)
      const joined = (calls ?? []).filter((call) => call.method.endsWith('Join'))
      const expectedTables = [
        journalEntries,
        ledgerAccounts,
        projects,
        accounts,
        vendors,
      ]
      expectedTables.forEach((table, index) => {
        expect(joined[index]?.args[0]).toBe(table)
      })
      for (const call of joined) {
        const join = compile(call.args[1])
        expect(join.sql).toMatch(/"tenant_id" = \$\d+\)$/)
        expect(join.params).toEqual([TENANT_ID])
      }

      const where = compile(argOf(calls ?? [], 'where'))
      expect(where.params).toEqual([
        TENANT_ID,
        TENANT_ID,
        'posted',
        ACCOUNT_ID,
        '2026-11-01',
        '2026-11-30',
      ])
      expect(where.sql).toContain('"journal_lines"."ledger_account_id" = $4')
      expect(argOf(calls ?? [], 'limit')).toBe(50_001)

      expect(rows.map((row) => row.description)).toEqual([
        'Opening entry',
        'Line text',
      ])
      expect(rows[0]).toMatchObject({
        entryNumber: 'JE-000001',
        projectName: '',
        vendorName: 'Supplier, Inc.',
        debitCents: 5_000,
      })
    })

    it('applies no optional filter when none is given', async () => {
      const [calls] = queueSelects([])

      await getLedgerExportRows(TENANT_ID, {}, 10)

      expect(compile(argOf(calls ?? [], 'where')).params).toEqual([
        TENANT_ID,
        TENANT_ID,
        'posted',
      ])
    })
  })

  describe('getReceivableAgingRows', () => {
    it('scopes open issued invoices to the tenant and derives open balances in integer centavos', async () => {
      const [calls] = queueSelects([
        {
          invoiceNumber: 'INV-0001',
          netAmountCents: 100_000,
          retentionCents: 10_000,
          currentAllocated: '40000',
          retentionAllocated: '15000',
          dueDate: new Date('2026-12-01T00:00:00.000Z'),
          issuedAt: new Date('2026-11-16T17:00:00.000Z'),
          projectName: 'Tower A',
          customerName: 'Metro',
        },
        {
          invoiceNumber: 'INV-0002',
          netAmountCents: 5_000,
          retentionCents: 0,
          currentAllocated: '0',
          retentionAllocated: '0',
          dueDate: null,
          issuedAt: null,
          projectName: 'Tower B',
          customerName: 'Metro',
        },
      ])

      const rows = await getReceivableAgingRows(TENANT_ID, 50_001)

      const where = compile(argOf(calls ?? [], 'where'))
      expect(where.sql).toContain('"invoices"."tenant_id" = $1')
      expect(where.sql).toContain('"invoices"."issuance_journal_entry_id" is not null')
      expect(where.params).toEqual([
        TENANT_ID,
        'issued',
        'partial_payment',
        'overdue',
      ])
      const joins = (calls ?? []).filter((call) => call.method === 'innerJoin')
      expect(joins.map((call) => call.args[0])).toEqual([projects, accounts])
      for (const call of joins) {
        const join = compile(call.args[1])
        expect(join.sql).toMatch(/"tenant_id" = \$\d+\)$/)
        expect(join.params).toEqual([TENANT_ID])
      }
      expect(argOf(calls ?? [], 'limit')).toBe(50_001)

      expect(rows[0]).toEqual({
        customerName: 'Metro',
        projectName: 'Tower A',
        invoiceNumber: 'INV-0001',
        issuedDay: '2026-11-17',
        dueDay: '2026-12-01',
        balanceDueCents: 60_000,
        retentionOpenCents: 0,
      })
      expect(rows[1]).toMatchObject({
        issuedDay: null,
        dueDay: null,
        balanceDueCents: 5_000,
      })
    })
  })

  describe('getPayableAgingRows', () => {
    it('lists only posted bills of the tenant that still have an open balance', async () => {
      const [calls] = queueSelects([
        {
          billNumber: 'SUP-77',
          internalNumber: null,
          billDate: '2026-10-01',
          dueDate: '2026-10-31',
          totalPayableCents: 112_000,
          paidCents: '12000',
          vendorName: 'Supplier, Inc.',
        },
      ])

      const rows = await getPayableAgingRows(TENANT_ID, 50_001)

      const where = compile(argOf(calls ?? [], 'where'))
      expect(where.sql).toContain('"supplier_bills"."tenant_id" = $1')
      expect(where.sql).toContain('"supplier_bills"."status" = $2')
      expect(where.sql).toContain('"supplier_bills"."total_payable_cents" >')
      // The paid-allocations subquery binds the session tenant on both tables.
      expect(where.sql).toContain('cash_tx.tenant_id = $3')
      expect(where.sql).toContain('allocation.tenant_id = $4')
      expect(where.params).toEqual([TENANT_ID, 'posted', TENANT_ID, TENANT_ID])
      const join = (calls ?? []).find((call) => call.method === 'innerJoin')
      expect(join?.args[0]).toBe(vendors)
      expect(compile(join?.args[1]).sql).toContain('"vendors"."tenant_id" = $')
      expect(compile(join?.args[1]).params).toEqual([TENANT_ID])
      expect(argOf(calls ?? [], 'limit')).toBe(50_001)

      expect(rows).toEqual([
        {
          vendorName: 'Supplier, Inc.',
          billNumber: 'SUP-77',
          internalNumber: '',
          billDay: '2026-10-01',
          dueDay: '2026-10-31',
          totalPayableCents: 112_000,
          paidCents: 12_000,
          openCents: 100_000,
        },
      ])
    })
  })
})
