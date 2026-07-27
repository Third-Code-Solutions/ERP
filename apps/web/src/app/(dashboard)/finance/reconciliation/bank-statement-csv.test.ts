import { describe, expect, it } from 'vitest'
import { parseBankStatementCsv } from './bank-statement-csv'

describe('bank statement CSV parser', () => {
  it('parses signed PHP amounts and quoted commas', () => {
    expect(
      parseBankStatementCsv(
        [
          'date,reference,description,amount',
          '2026-07-01,DEP-1,"Customer, Inc.","10,000.00"',
          '2026-07-02,CHK-2,Vendor payment,-2500.50',
        ].join('\n')
      )
    ).toEqual([
      {
        transactionDate: '2026-07-01',
        referenceNumber: 'DEP-1',
        description: 'Customer, Inc.',
        amountCents: 1_000_000,
      },
      {
        transactionDate: '2026-07-02',
        referenceNumber: 'CHK-2',
        description: 'Vendor payment',
        amountCents: -250_050,
      },
    ])
  })

  it('rejects a missing required header', () => {
    expect(() =>
      parseBankStatementCsv('date,description,amount\n2026-07-01,Deposit,1')
    ).toThrow('CSV header must include')
  })

  it('rejects invalid calendar dates and zero amounts', () => {
    expect(() =>
      parseBankStatementCsv(
        'date,reference,description,amount\n2026-02-30,R1,Deposit,1'
      )
    ).toThrow('invalid calendar date')
    expect(() =>
      parseBankStatementCsv(
        'date,reference,description,amount\n2026-02-28,R1,Deposit,0.00'
      )
    ).toThrow('safe, non-zero')
  })
})
