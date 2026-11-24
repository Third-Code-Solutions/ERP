import { describe, expect, it } from 'vitest'
import {
  numberBankStatementOccurrences,
  parseBankStatementCsv,
} from './bank-statement-csv'

const HEADER = 'date,reference,description,amount'

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

  it('names the line of a bad date or amount', () => {
    expect(() =>
      parseBankStatementCsv(
        [HEADER, '2026-07-01,R1,Deposit,1', '07/02/2026,R2,Deposit,1'].join('\n')
      )
    ).toThrow('Line 3 date must use YYYY-MM-DD')
    expect(() =>
      parseBankStatementCsv(
        [HEADER, '2026-07-01,R1,Deposit,1', '2026-02-30,R2,Deposit,1'].join('\n')
      )
    ).toThrow('Line 3 contains an invalid calendar date')
    expect(() =>
      parseBankStatementCsv([HEADER, '2026-07-01,R1,Deposit,12abc'].join('\n'))
    ).toThrow('Line 2 amount must be a signed number with at most two decimals')
    expect(() =>
      parseBankStatementCsv([HEADER, '2026-07-01,R1,Deposit,0'].join('\n'))
    ).toThrow('Line 2 amount must be a safe, non-zero value')
  })

  it('counts blank lines so the number matches the spreadsheet row', () => {
    expect(() =>
      parseBankStatementCsv(
        [
          HEADER,
          '2026-07-01,R1,Deposit,1',
          '',
          '2026-07-03,R2,Deposit,abc',
        ].join('\n')
      )
    ).toThrow('Line 4 amount')
  })

  it('explains a stray or unclosed quote with its line', () => {
    expect(() =>
      parseBankStatementCsv(
        [HEADER, '2026-07-01,R1,Pay "ACME" Inc,1'].join('\n')
      )
    ).toThrow(/^Line 2 has a stray quote\. Quotes may only wrap a whole field/)
    expect(() =>
      parseBankStatementCsv(
        [HEADER, '2026-07-01,R1,Deposit,1', '2026-07-02,R2,"Unfinished,1'].join(
          '\n'
        )
      )
    ).toThrow('Line 3 has a quote that is never closed.')
  })
})

describe('numberBankStatementOccurrences', () => {
  const fee = {
    transactionDate: '2026-07-01',
    referenceNumber: 'FEE',
    description: 'Card fee',
    amountCents: -1500,
  }

  it('numbers identical rows 1, 2, 3 and leaves a different row at 1', () => {
    const deposit = { ...fee, referenceNumber: 'DEP-1', description: 'Deposit', amountCents: 5000 }

    expect(
      numberBankStatementOccurrences([fee, deposit, fee, fee]).map((line) => line.occurrence)
    ).toEqual([1, 1, 2, 3])
  })

  it('counts rows that differ only by case or surrounding spaces as identical, so the database never sees a clash', () => {
    const shouting = { ...fee, referenceNumber: 'fee', description: '  CARD FEE ' }

    expect(
      numberBankStatementOccurrences([fee, shouting]).map((line) => line.occurrence)
    ).toEqual([1, 2])
  })

  it('does not merge rows that differ in date, reference or amount', () => {
    const rows = [
      fee,
      { ...fee, transactionDate: '2026-07-02' },
      { ...fee, referenceNumber: null },
      { ...fee, amountCents: -1501 },
    ]

    expect(numberBankStatementOccurrences(rows).map((line) => line.occurrence)).toEqual([1, 1, 1, 1])
  })

  it('keeps every parsed field and leaves its input untouched', () => {
    const parsed = parseBankStatementCsv(
      [HEADER, '2026-07-01,FEE,Card fee,-15.00', '2026-07-01,FEE,Card fee,-15.00'].join(
        '\n'
      )
    )

    expect(numberBankStatementOccurrences(parsed)).toEqual([
      { ...fee, occurrence: 1 },
      { ...fee, occurrence: 2 },
    ])
    expect(parsed[0]).not.toHaveProperty('occurrence')
  })
})
