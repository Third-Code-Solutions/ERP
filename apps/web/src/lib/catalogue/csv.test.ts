import { describe, expect, it } from 'vitest'
import {
  CATALOGUE_CSV_HEADER,
  CatalogueCsvError,
  parseCatalogueCsv,
  parseCsvRecords,
} from './csv'

const HEADER = CATALOGUE_CSV_HEADER.join(',')
const TODAY = '2026-11-10'
const PRICED =
  'CN-0001,Cement 40 kg,concrete,"Portland, 40 kg bag",bag,240,265,280,NCR,material_supply,https://example.com/prices,2026-11-05,LOW_AUTHORITY,"Two sources; ""retail"" price."'
const UNPRICED = 'CN-0003,Holcim Excel 40 kg,concrete,,bag,,,,NCR,material_supply,,2026-11-05,NO_SOURCE,No price found.'

function parse(rows: string[], options: { today?: string; expectedTrade?: string } = {}) {
  return parseCatalogueCsv([HEADER, ...rows].join('\n'), { today: TODAY, ...options })
}

function lineOf(run: () => unknown): { line: number; message: string } {
  try {
    run()
  } catch (error) {
    if (error instanceof CatalogueCsvError) return { line: error.line, message: error.message }
    throw error
  }
  throw new Error('expected a CatalogueCsvError')
}

/** Replaces one column (0-based) of the priced fixture row. */
function withColumn(index: number, value: string): string {
  const fields = parseCsvRecords(PRICED)[0]!.fields.map((field, position) =>
    position === index ? value : field,
  )
  return fields.map((field) => `"${field.replaceAll('"', '""')}"`).join(',')
}

describe('CSV records', () => {
  it('reads quoted commas, doubled quotes, embedded line breaks and CR LF endings', () => {
    const records = parseCsvRecords('a,"b,1","say ""hi"""\r\n"two\nlines",,x\r\n')
    expect(records).toEqual([
      { line: 1, fields: ['a', 'b,1', 'say "hi"'] },
      { line: 2, fields: ['two\nlines', '', 'x'] },
    ])
  })

  it('reports the line a record starts on after a multi-line field, and skips blank lines', () => {
    const records = parseCsvRecords('﻿a\n"b\nc"\n\nd')
    expect(records.map((record) => record.line)).toEqual([1, 2, 5])
    expect(records.at(-1)?.fields).toEqual(['d'])
  })

  it('rejects a stray quote, text after a closing quote and an unclosed quote', () => {
    expect(lineOf(() => parseCsvRecords('a\nb"c,d')).line).toBe(2)
    expect(lineOf(() => parseCsvRecords('"a"b,c')).message).toMatch(/after a closing quote/)
    expect(lineOf(() => parseCsvRecords('a\n"never closed')).message).toMatch(/never closed/)
  })
})

describe('catalogue CSV contract', () => {
  it('parses a priced and an unpriced row into centavos and nulls', () => {
    const [priced, unpriced] = parse([PRICED, UNPRICED])

    expect(priced).toEqual({
      line: 2,
      code: 'CN-0001',
      name: 'Cement 40 kg',
      trade: 'concrete',
      specification: 'Portland, 40 kg bag',
      unit: 'bag',
      price: { low: 24_000, avg: 26_500, high: 28_000 },
      region: 'NCR',
      price_basis: 'material_supply',
      source_url: 'https://example.com/prices',
      checked_on: '2026-11-05',
      flag: 'LOW_AUTHORITY',
      notes: 'Two sources; "retail" price.',
    })
    expect(unpriced).toMatchObject({
      line: 3,
      specification: null,
      price: null,
      source_url: null,
      flag: 'NO_SOURCE',
    })
  })

  it('requires the exact 14-column header', () => {
    const renamed = HEADER.replace('date_checked', 'checked_on')
    expect(lineOf(() => parseCatalogueCsv(`${renamed}\n${PRICED}`)).message).toMatch(/header/)
    expect(lineOf(() => parseCatalogueCsv('')).message).toMatch(/header/)
  })

  it('rejects a row with the wrong number of columns and names its line', () => {
    const short = UNPRICED.split(',').slice(0, 13).join(',')
    expect(lineOf(() => parse([UNPRICED, short]))).toEqual({
      line: 3,
      message: 'expected 14 columns, found 13',
    })
    // An unquoted comma in the notes adds a fifteenth column.
    expect(lineOf(() => parse([`${UNPRICED}, see CN-0001`])).message).toBe(
      'expected 14 columns, found 15',
    )
  })

  it('checks the code format, the trade and that the code prefix belongs to the trade', () => {
    expect(lineOf(() => parse([withColumn(0, 'CN-1')])).message).toMatch(/must look like/)
    expect(lineOf(() => parse([withColumn(2, 'carpentry')])).message).toMatch(/unknown trade/)
    expect(lineOf(() => parse([withColumn(0, 'PT-0001')])).message).toMatch(/prefix of trade/)
    expect(lineOf(() => parse([PRICED], { expectedTrade: 'paint' })).message).toMatch(
      /does not belong in the paint file/,
    )
  })

  it('accepts every flag token, and SNIPPET_ONLY only on a priced row', () => {
    const flags = 'SINGLE_SOURCE;STALE_2024;NON_NCR;LOW_AUTHORITY;SNIPPET_ONLY'
    expect(parse([withColumn(12, flags)])[0]?.flag).toBe(flags)
    expect(parse([withColumn(12, '')])[0]?.flag).toBeNull()
    expect(lineOf(() => parse([withColumn(12, 'UNVERIFIED')])).message).toMatch(/unknown flag/)
    expect(
      lineOf(() => parse([UNPRICED.replace('NO_SOURCE', 'NO_SOURCE;SNIPPET_ONLY')])).message,
    ).toMatch(/exactly the flag NO_SOURCE/)
  })

  it('ties blank prices to exactly NO_SOURCE and forbids NO_SOURCE on a priced row', () => {
    expect(lineOf(() => parse([UNPRICED.replace('NO_SOURCE', '')])).message).toMatch(
      /exactly the flag NO_SOURCE/,
    )
    expect(lineOf(() => parse([UNPRICED.replace('NO_SOURCE', 'NO_SOURCE;NON_NCR')])).message).toMatch(
      /exactly the flag NO_SOURCE/,
    )
    expect(lineOf(() => parse([withColumn(12, 'NO_SOURCE')])).message).toMatch(/priced row/)
  })

  it('wants all three prices or none, valid amounts and low <= average <= high', () => {
    expect(lineOf(() => parse([withColumn(6, '')])).message).toMatch(/all filled or all blank/)
    expect(lineOf(() => parse([withColumn(5, 'about 240')])).message).toMatch(
      /price_low_php "about 240" is not a valid peso amount/,
    )
    expect(lineOf(() => parse([withColumn(5, '270')])).message).toMatch(/low price/)
    expect(lineOf(() => parse([withColumn(7, '260')])).message).toMatch(/average price/)
    // Half-up at the centavo, with a peso sign and a thousands separator.
    expect(parse([withColumn(6, '₱265.005')])[0]?.price?.avg).toBe(26_501)
    expect(parse([withColumn(7, '1,280.125')])[0]?.price?.high).toBe(128_013)
  })

  it('rejects a future or malformed checked date', () => {
    expect(lineOf(() => parse([withColumn(11, '2026-11-11')])).message).toMatch(/after today/)
    expect(lineOf(() => parse([withColumn(11, '5 Nov 2026')])).message).toMatch(/real date/)
    expect(parse([withColumn(11, TODAY)])[0]?.checked_on).toBe(TODAY)
  })

  it('validates the source URL and stores its parsed form', () => {
    expect(parse([withColumn(10, 'HTTP://Example.com')])[0]?.source_url).toBe('http://example.com/')
    expect(lineOf(() => parse([withColumn(10, 'javascript:alert(1)')])).message).toMatch(/http/)
    expect(lineOf(() => parse([withColumn(10, 'https://a:b@example.com')])).message).toMatch(
      /username or password/,
    )
  })

  it('strips control characters and enforces the length limits', () => {
    const [row] = parse([withColumn(1, ' Cement\t40\u0000 kg '), withColumn(0, 'CN-0002')])
    expect(row?.name).toBe('Cement 40 kg')
    expect(parse([withColumn(13, 'line 1\r\nline 2\u0007')])[0]?.notes).toBe('line 1\nline 2')
    expect(parse([withColumn(4, 'set/month')])[0]?.unit).toBe('set/month')
    expect(lineOf(() => parse([withColumn(1, '  ')])).message).toBe('name is required')
    expect(lineOf(() => parse([withColumn(1, 'x'.repeat(301))])).message).toMatch(/at most 300/)
    expect(lineOf(() => parse([withColumn(4, 'x'.repeat(21))])).message).toMatch(/at most 20/)
    expect(lineOf(() => parse([withColumn(8, '')])).message).toBe('region is required')
    expect(lineOf(() => parse([withColumn(13, 'x'.repeat(2_001))])).message).toMatch(/at most 2000/)
  })

  it('rejects a code that appears twice in one file', () => {
    expect(lineOf(() => parse([PRICED, UNPRICED, PRICED]))).toEqual({
      line: 4,
      message: 'code "CN-0001" already appears on line 2',
    })
  })
})
