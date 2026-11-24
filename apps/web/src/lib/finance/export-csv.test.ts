import { describe, expect, it } from 'vitest'
import {
  capExportRows,
  FINANCE_EXPORT_MAX_ROWS,
  ledgerCsv,
  payableAgingCsv,
  receivableAgingCsv,
  trialBalanceCsv,
} from './export-csv'
import type { LedgerExportRow, PayableAgingRow, ReceivableAgingRow } from './report-queries'
import { buildTrialBalance } from './trial-balance'

const BOM = '﻿'

function dataLines(csv: string): string[] {
  return csv.replace(BOM, '').split('\r\n').filter((line) => line !== '')
}

describe('capExportRows', () => {
  it('keeps everything up to the cap and flags nothing', () => {
    const rows = new Array(FINANCE_EXPORT_MAX_ROWS).fill(1)

    const result = capExportRows(rows)

    expect(result.rows).toHaveLength(FINANCE_EXPORT_MAX_ROWS)
    expect(result.truncated).toBe(false)
  })

  it('drops the sentinel row and flags truncation when the cap is exceeded', () => {
    const rows = new Array(FINANCE_EXPORT_MAX_ROWS + 1).fill(1)

    const result = capExportRows(rows)

    expect(result.rows).toHaveLength(FINANCE_EXPORT_MAX_ROWS)
    expect(result.truncated).toBe(true)
  })
})

describe('trialBalanceCsv', () => {
  it('writes pesos with two decimals, balances on the normal side and a TOTAL row', () => {
    const trialBalance = buildTrialBalance(
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

    expect(dataLines(trialBalanceCsv(trialBalance))).toEqual([
      '"account_code","account_name","account_type","normal_balance","debit_php","credit_php","balance_php"',
      `"1000","Cash, ""main"" =acct","asset","debit",1500.05,500.00,1000.05`,
      '"4000","Revenue","income","credit",0.00,1000.05,1000.05',
      '"TOTAL","","","",1500.05,1500.05,""',
    ])
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

    expect(dataLines(trialBalanceCsv(trialBalance))[1]).toBe(
      '"1000","Cash","asset","debit",0.00,25.50,-25.50'
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

  it('neutralises formula leads in text columns and leaves amounts untouched', () => {
    const [, line] = dataLines(ledgerCsv([row], false))

    expect(line).toBe(
      `"2026-11-02","JE-000001","manual","1000","Cash","","'@Customer","'-Vendor","'=HYPERLINK(""http://evil"",""x"")",1234.56,0.00`
    )
  })

  it('adds a truncation notice above the header only when truncated', () => {
    const plain = dataLines(ledgerCsv([row], false))
    const truncated = dataLines(ledgerCsv([row], true))

    expect(plain[0]).toMatch(/^"posting_date",/)
    expect(truncated[0]).toBe(
      '"NOTE: export truncated at 50,000 rows. Narrow the filters and export again for the remaining rows."'
    )
    expect(truncated[1]).toBe(plain[0])
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

  it('computes Manila days overdue and the bucket from the due day', () => {
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

    const lines = dataLines(receivableAgingCsv(rows, '2026-11-17', false)).slice(1)

    const overdueAndBucket = lines.map((line) => {
      const cells = line.split(',')
      return `${cells[2]} ${cells[5]} ${cells[6]}`
    })
    expect(overdueAndBucket).toEqual([
      '"A" 0 "Current"',
      '"B" 0 "Current"',
      '"C" 1 "1-30"',
      '"D" 30 "1-30"',
      '"E" 61 "61-90"',
      '"F" 91 "91+"',
      '"G" 92 "91+"',
      '"H" 0 "Current"',
    ])
  })

  it('writes balance and retention in pesos', () => {
    const [header, line] = dataLines(receivableAgingCsv([base], '2026-11-17', false))

    expect(header).toBe(
      '"customer","project","invoice_number","issued_date","due_date","days_overdue","aging_bucket","balance_due_php","retention_open_php"'
    )
    expect(line).toBe(
      '"Metro Builders","Tower A","INV-0001","2026-08-01","2026-08-31",78,"61-90",600.00,100.00'
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
    const [header, line] = dataLines(payableAgingCsv([base], '2026-11-17', false))

    expect(header).toBe(
      '"vendor","vendor_bill_number","internal_number","bill_date","due_date","days_overdue","aging_bucket","total_payable_php","paid_php","open_balance_php"'
    )
    expect(line).toBe(
      '"Supplier, Inc.","SUP-77","","2026-10-01","2026-10-31",17,"1-30",1120.00,120.00,1000.00'
    )
  })

  it('flags truncation above the header row', () => {
    const [notice] = dataLines(payableAgingCsv([base], '2026-11-17', true))

    expect(notice).toContain('NOTE: export truncated at 50,000 rows')
  })
})
