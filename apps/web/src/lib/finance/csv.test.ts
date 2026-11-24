import { describe, expect, it } from 'vitest'
import {
  csvNumberCell,
  csvTextCell,
  encodeCsv,
  type CsvColumn,
} from './csv'

describe('csvTextCell', () => {
  it('quotes every text field, including plain and empty ones', () => {
    expect(csvTextCell('Metro Builders')).toBe('"Metro Builders"')
    expect(csvTextCell('')).toBe('""')
  })

  it('doubles embedded quotes and keeps commas and line breaks inside the quotes', () => {
    expect(csvTextCell('ACME, "Metro"\r\nBranch')).toBe(
      '"ACME, ""Metro""\r\nBranch"'
    )
  })

  it.each([
    ['=1+1', `"'=1+1"`],
    ['+63917', `"'+63917"`],
    ['-2+3', `"'-2+3"`],
    ['@SUM(A1:A9)', `"'@SUM(A1:A9)"`],
    ['\tcmd', `"'\tcmd"`],
    ['\rcmd', `"'\rcmd"`],
    ['=HYPERLINK("http://x","y")', `"'=HYPERLINK(""http://x"",""y"")"`],
  ])('neutralises the formula lead in %j', (value, expected) => {
    expect(csvTextCell(value)).toBe(expected)
  })

  it('leaves characters that are only dangerous at the start untouched elsewhere', () => {
    expect(csvTextCell('A=B+C-D@E')).toBe('"A=B+C-D@E"')
    expect(csvTextCell(' =spaced')).toBe('" =spaced"')
  })
})

describe('csvNumberCell', () => {
  it.each(['0.00', '1234.50', '-123.45', '7'])('leaves %s bare', (value) => {
    expect(csvNumberCell(value)).toBe(value)
  })

  it('falls back to the safe text path when a numeric column holds anything else', () => {
    expect(csvNumberCell('=1+1')).toBe(`"'=1+1"`)
    expect(csvNumberCell('1,234.50')).toBe('"1,234.50"')
    expect(csvNumberCell('')).toBe('""')
  })
})

describe('encodeCsv', () => {
  interface Row {
    name: string
    amount: string
  }
  const columns: readonly CsvColumn<Row>[] = [
    { header: 'name', value: (row) => row.name },
    { header: 'amount_php', numeric: true, value: (row) => row.amount },
  ]

  it('writes a BOM, a quoted header, CRLF line ends and untouched numeric columns', () => {
    const csv = encodeCsv(columns, [
      { name: '=cmd|calc', amount: '-123.45' },
      { name: 'Plain', amount: '10.00' },
    ])

    expect(csv).toBe(
      '﻿"name","amount_php"\r\n' +
        `"'=cmd|calc",-123.45\r\n` +
        '"Plain",10.00\r\n'
    )
  })

  it('puts a notice line above the header when one is given', () => {
    const csv = encodeCsv(columns, [], 'Truncated at 2 rows')

    expect(csv).toBe(
      '﻿"Truncated at 2 rows"\r\n"name","amount_php"\r\n'
    )
  })

  it('neutralises a formula lead in a notice as well', () => {
    expect(encodeCsv(columns, [], '=bad')).toContain(`"'=bad"`)
  })
})
