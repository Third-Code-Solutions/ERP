import {
  CATALOGUE_LIMITS,
  CATALOGUE_SEED_CODE,
  catalogueFlagProblem,
  checkedOnProblem,
  cleanMultiLine,
  cleanSingleLine,
  codeMatchesTrade,
  isCatalogueTrade,
  manilaToday,
  parseSourceUrl,
  phpToCentavos,
  priceRangeProblem,
  splitCatalogueFlags,
  type CataloguePriceRange,
  type CatalogueTrade,
} from './rules'

/**
 * Parser and validator for the catalogue research files
 * (`data/catalogue/NN-<trade>.csv`, spec section 7). Loaded by
 * scripts/seed-catalogue.mjs in plain Node, so it imports only ./rules.
 */

export const CATALOGUE_CSV_HEADER = [
  'code',
  'name',
  'trade',
  'specification',
  'unit',
  'price_low_php',
  'price_avg_php',
  'price_high_php',
  'region',
  'price_basis',
  'source_url',
  'date_checked',
  'flag',
  'notes',
] as const

export interface CatalogueCsvRow {
  /** 1-based line where the record starts. */
  line: number
  code: string
  name: string
  trade: CatalogueTrade
  specification: string | null
  unit: string
  /** Centavos, or null for a row without a price (`NO_SOURCE`). */
  price: CataloguePriceRange | null
  region: string
  price_basis: string | null
  source_url: string | null
  checked_on: string
  flag: string | null
  notes: string | null
}

export class CatalogueCsvError extends Error {
  readonly line: number

  constructor(line: number, message: string) {
    super(message)
    this.name = 'CatalogueCsvError'
    this.line = line
  }
}

export interface CsvRecord {
  line: number
  fields: string[]
}

/**
 * RFC 4180 records: quoted fields may hold commas, line breaks and doubled
 * quotes. Blank lines are skipped. Throws on a quote inside an unquoted field
 * or a quoted field that never closes.
 */
export function parseCsvRecords(text: string): CsvRecord[] {
  const source = text.startsWith('﻿') ? text.slice(1) : text
  const records: CsvRecord[] = []
  let fields: string[] = []
  let field = ''
  let quoted = false
  let wasQuoted = false
  let line = 1
  let recordLine = 1

  const endField = () => {
    fields.push(field)
    field = ''
    wasQuoted = false
  }
  const endRecord = () => {
    endField()
    if (fields.length > 1 || fields[0] !== '') records.push({ line: recordLine, fields })
    fields = []
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!
    if (char === '\n') line += 1
    if (quoted) {
      if (char !== '"') field += char
      else if (source[index + 1] === '"') {
        field += '"'
        index += 1
      } else quoted = false
      continue
    }
    if (char === '"') {
      if (field !== '' || wasQuoted) {
        throw new CatalogueCsvError(recordLine, 'unexpected quote inside a field')
      }
      quoted = true
      wasQuoted = true
    } else if (char === ',') endField()
    else if (char === '\n') {
      endRecord()
      recordLine = line
    } else if (char === '\r' && source[index + 1] === '\n') continue
    else if (wasQuoted) {
      throw new CatalogueCsvError(recordLine, 'unexpected text after a closing quote')
    } else field += char
  }
  if (quoted) throw new CatalogueCsvError(recordLine, 'quoted field is never closed')
  endRecord()
  return records
}

function fail(line: number, message: string): never {
  throw new CatalogueCsvError(line, message)
}

function bounded(line: number, label: string, value: string, max: number, min = 0): string {
  if (value.length < min) fail(line, `${label} is required`)
  if (value.length > max) fail(line, `${label} must be at most ${max} characters`)
  return value
}

function parsePrices(line: number, low: string, avg: string, high: string): CataloguePriceRange | null {
  const texts = { price_low_php: low, price_avg_php: avg, price_high_php: high }
  const filled = Object.values(texts).filter(Boolean).length
  if (filled === 0) return null
  if (filled !== 3) fail(line, 'the three prices must be all filled or all blank')

  const centavos = Object.entries(texts).map(([column, text]) => {
    const parsed = phpToCentavos(text)
    if (!parsed.ok) fail(line, `${column} "${text}" is not a valid peso amount (${parsed.problem})`)
    return parsed.centavos
  })
  const range = { low: centavos[0]!, avg: centavos[1]!, high: centavos[2]! }
  const problem = priceRangeProblem(range)
  if (problem) fail(line, problem)
  return range
}

function parseRow(record: CsvRecord, today: string, expectedTrade?: string): CatalogueCsvRow {
  const { line } = record
  if (record.fields.length !== CATALOGUE_CSV_HEADER.length) {
    fail(line, `expected ${CATALOGUE_CSV_HEADER.length} columns, found ${record.fields.length}`)
  }
  const raw = (column: (typeof CATALOGUE_CSV_HEADER)[number]) =>
    record.fields[CATALOGUE_CSV_HEADER.indexOf(column)] ?? ''
  const oneLine = (column: (typeof CATALOGUE_CSV_HEADER)[number]) => cleanSingleLine(raw(column))
  const code = oneLine('code')
  const trade = oneLine('trade')
  const flag = oneLine('flag')
  const checked = oneLine('date_checked')
  const url = oneLine('source_url')
  const specification = cleanMultiLine(raw('specification'))
  const notes = cleanMultiLine(raw('notes'))

  if (!CATALOGUE_SEED_CODE.test(code)) fail(line, `code "${code}" must look like CN-0001`)
  if (!isCatalogueTrade(trade)) fail(line, `unknown trade "${trade}"`)
  if (expectedTrade !== undefined && trade !== expectedTrade) {
    fail(line, `trade "${trade}" does not belong in the ${expectedTrade} file`)
  }
  if (!codeMatchesTrade(code, trade)) {
    fail(line, `code "${code}" does not carry the prefix of trade "${trade}"`)
  }

  const price = parsePrices(
    line,
    oneLine('price_low_php'),
    oneLine('price_avg_php'),
    oneLine('price_high_php'),
  )
  const flagProblem = catalogueFlagProblem(flag)
  if (flagProblem) fail(line, flagProblem)
  const tokens = splitCatalogueFlags(flag)
  if (price === null && tokens.join(';') !== 'NO_SOURCE') {
    fail(line, 'a row without prices must carry exactly the flag NO_SOURCE')
  }
  if (price !== null && tokens.includes('NO_SOURCE')) {
    fail(line, 'a priced row must not carry the flag NO_SOURCE')
  }

  const dateProblem = checkedOnProblem(checked, today)
  if (dateProblem) fail(line, dateProblem)

  let sourceUrl: string | null = null
  if (url) {
    const parsedUrl = parseSourceUrl(url)
    if (!parsedUrl.ok) fail(line, parsedUrl.error)
    sourceUrl = parsedUrl.href
  }

  return {
    line,
    code,
    name: bounded(line, 'name', oneLine('name'), CATALOGUE_LIMITS.name, 1),
    trade,
    specification: bounded(line, 'specification', specification, CATALOGUE_LIMITS.specification) || null,
    unit: bounded(line, 'unit', oneLine('unit'), CATALOGUE_LIMITS.unit, 1),
    price,
    region: bounded(line, 'region', oneLine('region'), CATALOGUE_LIMITS.region, 1),
    price_basis:
      bounded(line, 'price_basis', oneLine('price_basis'), CATALOGUE_LIMITS.priceBasis) || null,
    source_url: sourceUrl,
    checked_on: checked,
    flag: bounded(line, 'flag', tokens.join(';'), CATALOGUE_LIMITS.flag) || null,
    notes: bounded(line, 'notes', notes, CATALOGUE_LIMITS.notes) || null,
  }
}

export interface ParseCatalogueCsvOptions {
  /** Manila "today" (YYYY-MM-DD); a later `date_checked` is rejected. */
  today?: string
  /** Trade slug taken from the file name; every row must carry it. */
  expectedTrade?: string
}

/**
 * Validates a whole file: the exact 14-column header, then every row. Throws a
 * CatalogueCsvError carrying the line of the first invalid row, so a caller
 * can stop before anything is written.
 */
export function parseCatalogueCsv(
  text: string,
  { today = manilaToday(), expectedTrade }: ParseCatalogueCsvOptions = {},
): CatalogueCsvRow[] {
  const [header, ...records] = parseCsvRecords(text)
  if (!header || header.fields.join(',') !== CATALOGUE_CSV_HEADER.join(',')) {
    fail(header?.line ?? 1, `header must be exactly: ${CATALOGUE_CSV_HEADER.join(',')}`)
  }

  const rows = records.map((record) => parseRow(record, today, expectedTrade))
  const seen = new Map<string, number>()
  for (const row of rows) {
    const firstLine = seen.get(row.code)
    if (firstLine !== undefined) {
      fail(row.line, `code "${row.code}" already appears on line ${firstLine}`)
    }
    seen.set(row.code, row.line)
  }
  return rows
}
