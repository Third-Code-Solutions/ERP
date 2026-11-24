import { describe, expect, it } from 'vitest'
import {
  exceedsExportLimit,
  FINANCE_EXPORT_MAX_ROWS,
  ledgerCsv,
  payableAgingCsv,
  receivableAgingCsv,
  trialBalanceCsv,
  trialBalanceRangeLabel,
} from './export-csv'
import type { LedgerExportRow, PayableAgingRow, ReceivableAgingRow } from './report-queries'
import { buildTrialBalance } from './trial-balance'

const BOM = '﻿'
const CUMULATIVE = { from: null, to: '2026-11-30' }
const NOVEMBER = { from: '2026-11-01', to: '2026-11-30' }

function dataLines(csv: string): string[] {
  return csv.replace(BOM, '').split('\r\n').filter((line) => line !== '')
}

describe('exceedsExportLimit', () => {
  it('allows exactly the cap and refuses the sentinel row above it', () => {
    expect(exceedsExportLimit(new Array(FINANCE_EXPORT_MAX_ROWS).fill(1))).toBe(false)
    expect(exceedsExportLimit(new Array(FINANCE_EXPORT_MAX_ROWS + 1).fill(1))).toBe(true)
  })
})

describe('trialBalanceCsv', () => {
  const twoAccounts = buildTrialBalance(
    [
      {
        id: 'cash',
        code: '1000',
        name: 'Cash, "main" =acct',
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
      { accountId: 'cash', debitCents: 150_005, creditCents: 50_000 },
      { accountId: 'rev', debitCents: 0, creditCents: 100_005 },
    ]
  )

  it('writes pesos with two decimals, balances on the normal side, a TOTAL row and a RANGE row', () => {
    expect(dataLines(trialBalanceCsv(twoAccounts, CUMULATIVE))).toEqual([
      'account_code,account_name,account_type,normal_balance,debit_php,credit_php,balance_php',
      `1000,"Cash, ""main"" =acct",asset,debit,1500.05,500.00,1000.05`,
      '4000,Revenue,income,credit,0.00,1000.05,1000.05',
      'TOTAL,,,,1500.05,1500.05,',
      'RANGE,Balances of posted entries dated up to 2026-11-30,,,,,',
    ])
  })

  it('labels a period report as net movement, since it has no opening balance', () => {
    const lines = dataLines(trialBalanceCsv(twoAccounts, NOVEMBER))

    expect(lines[0]).toBe(
      'account_code,account_name,account_type,normal_balance,debit_php,credit_php,net_movement_php'
    )
    expect(lines.at(-1)).toBe(
      'RANGE,Net movement of posted entries dated 2026-11-01 to 2026-11-30,,,,,'
    )
  })

  it('names the range for the file name', () => {
    expect(trialBalanceRangeLabel(CUMULATIVE)).toBe('start-to-2026-11-30')
    expect(trialBalanceRangeLabel(NOVEMBER)).toBe('2026-11-01-to-2026-11-30')
  })

  it('keeps a contra balance numeric rather than treating the minus sign as a formula', () => {
    const trialBalance = buildTrialBalance(
      [
        {
          id: 'cash',
          code: '1000',
          name: 'Cash',
          accountType: 'asset',
          normalBalance: 'debit',
          isActive: true,
        },
      ],
      [{ accountId: 'cash', debitCents: 0, creditCents: 2_550 }]
    )

    expect(dataLines(trialBalanceCsv(trialBalance, CUMULATIVE))[1]).toBe(
      '1000,Cash,asset,debit,0.00,25.50,-25.50'
    )
  })
})

describe('ledgerCsv', () => {
  const row: LedgerExportRow = {
    postingDate: '2026-11-02',
    entryNumber: 'JE-000001',
    sourceType: 'manual',
    accountCode: '1000',
    accountName: 'Cash',
    projectName: '',
    customerName: '@Customer',
    vendorName: '-Vendor',
    description: '=HYPERLINK("http://evil","x")',
    debitCents: 123_456,
    creditCents: 0,
  }

  it('puts the header first, neutralises formula leads in text columns and leaves amounts untouched', () => {
    const [header, line] = dataLines(ledgerCsv([row]))

    expect(header).toMatch(/^posting_date,/)
    expect(line).toBe(
      `2026-11-02,JE-000001,manual,1000,Cash,,'@Customer,'-Vendor,"'=HYPERLINK(""http://evil"",""x"")",1234.56,0.00`
    )
  })
})

describe('receivableAgingCsv', () => {
  const base: ReceivableAgingRow = {
    customerName: 'Metro Builders',
    projectName: 'Tower A',
    invoiceNumber: 'INV-0001',
    issuedDay: '2026-08-01',
    dueDay: '2026-08-31',
    balanceDueCents: 60_000,
    retentionOpenCents: 10_000,
  }

  it('computes days overdue and the shared bucket from the due day', () => {
    const rows: ReceivableAgingRow[] = [
      { ...base, invoiceNumber: 'A', dueDay: '2026-11-20' },
      { ...base, invoiceNumber: 'B', dueDay: '2026-11-17' },
      { ...base, invoiceNumber: 'C', dueDay: '2026-11-16' },
      { ...base, invoiceNumber: 'D', dueDay: '2026-10-18' },
      { ...base, invoiceNumber: 'E', dueDay: '2026-09-17' },
      { ...base, invoiceNumber: 'F', dueDay: '2026-08-18' },
      { ...base, invoiceNumber: 'G', dueDay: '2026-08-17' },
      { ...base, invoiceNumber: 'H', dueDay: null, issuedDay: null },
    ]

    const lines = dataLines(receivableAgingCsv(rows, '2026-11-17')).slice(1)

    const overdueAndBucket = lines.map((line) => {
      const cells = line.split(',')
      return `${cells[2]} ${cells[5]} ${cells[6]}`
    })
    expect(overdueAndBucket).toEqual([
      'A 0 Current',
      'B 0 Current',
      'C 1 1–30 days',
      'D 30 1–30 days',
      'E 61 61–90 days',
      'F 91 90+ days',
      'G 92 90+ days',
      'H  No due date',
    ])
  })

  it('writes balance and retention in pesos', () => {
    const [header, line] = dataLines(receivableAgingCsv([base], '2026-11-17'))

    expect(header).toBe(
      'customer,project,invoice_number,issued_date,due_date,days_overdue,aging_bucket,balance_due_php,retention_open_php'
    )
    expect(line).toBe(
      'Metro Builders,Tower A,INV-0001,2026-08-01,2026-08-31,78,61–90 days,600.00,100.00'
    )
  })
})

describe('payableAgingCsv', () => {
  const base: PayableAgingRow = {
    vendorName: 'Supplier, Inc.',
    billNumber: 'SUP-77',
    internalNumber: '',
    billDay: '2026-10-01',
    dueDay: '2026-10-31',
    totalPayableCents: 112_000,
    paidCents: 12_000,
    openCents: 100_000,
  }

  it('writes the bill, days overdue, bucket and open balance', () => {
    const [header, line] = dataLines(payableAgingCsv([base], '2026-11-17'))

    expect(header).toBe(
      'vendor,vendor_bill_number,internal_number,bill_date,due_date,days_overdue,aging_bucket,total_payable_php,paid_php,open_balance_php'
    )
    expect(line).toBe(
      '"Supplier, Inc.",SUP-77,,2026-10-01,2026-10-31,17,1–30 days,1120.00,120.00,1000.00'
    )
  })
})
