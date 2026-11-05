import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import * as ExcelJS from 'exceljs'
import {
  lineTotal,
  validateTakeoffRows,
  type StructuredTakeoffRow,
  type TakeoffValidationIssue,
} from '@third-code-erp/shared-types/bom'
import {
  TAKEOFF_IMPORT_MAX_ROWS,
  TAKEOFF_MAX_UNIT_RATE_CENTAVOS,
} from '@third-code-erp/shared-types'
import {
  cellCentavos,
  cellDecimal,
  cellQuantity,
  cellText,
  formatCentavos,
  type CellNumber,
  type CellNumberProblem,
} from '@/lib/operations/boq-excel/cells'

export { validateTakeoffRows }
export type { StructuredTakeoffRow, TakeoffValidationIssue }

export interface TakeoffColumnMapping {
  sourceRowKey?: string
  description: string
  quantity: string
  unit: string
  division?: string
  location?: string
  itemNo?: string
  notes?: string
  unitRate?: string
  amount?: string
}

export interface TakeoffParseOptions {
  /** Worksheet name (.xlsx); the first sheet when absent. */
  sheet?: string
  /** 1-based header row; auto-detected when absent. */
  headerRow?: number
  /** Rows with no quantity, unit, rate or amount become the division below. Default on. */
  sectionHeaders?: boolean
}

export type TakeoffRowWarningCode =
  | 'AMOUNT_MISMATCH'
  | 'QUANTITY_ROUNDED'
  | 'UNREADABLE_QUANTITY'
  | 'UNREADABLE_UNIT_RATE'
  | 'UNREADABLE_AMOUNT'

export interface TakeoffRowWarning {
  sourceRowKey: string
  code: TakeoffRowWarningCode
  message: string
}

export interface StructuredTakeoffResult {
  rows: StructuredTakeoffRow[]
  missingColumns: string[]
  headers: string[]
  headerRow: number
  /** Blank and total/subtotal rows below the header. */
  skippedRows: number
  /** Section header rows that set a division instead of importing. */
  sectionRows: number
  warnings: TakeoffRowWarning[]
  /** Present for .xlsx: every sheet name and the one read. */
  workbook?: { sheets: string[]; sheet: string }
}

/** A file over the parser's size limits; the message is safe to show. */
export class TakeoffTooLargeError extends Error {}

export const TAKEOFF_MAX_HEADER_ROW = 50
export const TAKEOFF_MAX_COLUMNS = 64
export const TAKEOFF_TOO_MANY_ROWS_MESSAGE = `The sheet has more than ${TAKEOFF_IMPORT_MAX_ROWS.toLocaleString('en-PH')} rows. Split it and import each part.`

export const XLSX_LIMITS = {
  uncompressedBytes: 100 * 1024 * 1024,
  rows: 20_000,
  columns: TAKEOFF_MAX_COLUMNS,
}

type MappedField = Exclude<keyof TakeoffColumnMapping, 'sourceRowKey'>
type ColumnIndexes = Record<keyof TakeoffColumnMapping, number>
type Warn = (code: TakeoffRowWarningCode, message: string) => void

// Exact (normalized) headers tried when the mapped one is not in the file, so
// a BOQ exported by this system auto-maps.
const HEADER_ALIASES: Record<MappedField, readonly string[]> = {
  description: ['description', 'item description', 'particulars', 'scope of work'],
  quantity: ['quantity', 'qty'],
  unit: ['uom', 'unit', 'units'],
  division: ['division'],
  location: ['location'],
  itemNo: ['item no', 'item no.', 'item'],
  notes: ['notes', 'remarks'],
  unitRate: ['unit rate (php)', 'unit rate', 'rate', 'unit cost', 'unit price'],
  amount: ['amount (php)', 'amount', 'total amount'],
}

const REQUIRED_FIELDS = [
  ['description', 'Description'],
  ['quantity', 'Quantity'],
  ['unit', 'UOM'],
] as const

const TOTAL_ROW = /^(sub)?total\b/i

const PROBLEM_TEXT: Record<CellNumberProblem, string> = {
  BLANK: 'is blank',
  NOT_A_NUMBER: 'is not a number',
  FORMULA_WITHOUT_RESULT: 'is a formula with no saved result (open and save it in Excel)',
  NEGATIVE: 'is negative',
  OUT_OF_RANGE: 'is out of range',
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function findColumn(headers: string[], field: MappedField, configured: string | undefined): number {
  // A mapping the user blanked turns the field off: no alias fallback.
  if (configured !== undefined && configured.trim() === '') return -1
  const candidates = [...(configured ? [normalizeHeader(configured)] : []), ...HEADER_ALIASES[field]]
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate)
    if (index >= 0) return index
  }
  return -1
}

function isBlankRow(cells: readonly unknown[]): boolean {
  return cells.every((cell) => cellText(cell).trim() === '')
}

function isBlankCell(cell: unknown): boolean {
  const value = cellDecimal(cell)
  return !value.ok && value.problem === 'BLANK'
}

function detectHeaderRow(grid: unknown[][], mapping: TakeoffColumnMapping): number {
  const descriptions = new Set([normalizeHeader(mapping.description), ...HEADER_ALIASES.description])
  const quantities = new Set([normalizeHeader(mapping.quantity), ...HEADER_ALIASES.quantity])
  const limit = Math.min(grid.length, TAKEOFF_MAX_HEADER_ROW)
  for (let index = 0; index < limit; index += 1) {
    const headers = (grid[index] ?? []).map((cell) => normalizeHeader(cellText(cell)))
    if (headers.some((h) => descriptions.has(h)) && headers.some((h) => quantities.has(h))) {
      return index + 1
    }
  }
  return 1
}

/** Last sheet row read: the header (auto: within 1-50) plus one row past the cap. */
function lastReadRow(options: TakeoffParseOptions): number {
  return (options.headerRow ?? TAKEOFF_MAX_HEADER_ROW) + TAKEOFF_IMPORT_MAX_ROWS + 1
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!
    const next = line[index + 1]
    if (character === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (character === '"') {
      quoted = !quoted
      continue
    }
    if (character === ',' && !quoted) {
      cells.push(current.trim())
      if (cells.length === TAKEOFF_MAX_COLUMNS) return cells
      current = ''
      continue
    }
    current += character
  }
  cells.push(current.trim())
  return cells
}

function columnNumber(letters: string): number {
  return [...letters.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0)
}

/** Rejects a worksheet whose declared used range is over the limits. */
function checkDimension(xml: Buffer, limits: typeof XLSX_LIMITS): void {
  // <dimension> sits near the top of the sheet XML.
  const head = xml.toString('utf8', 0, Math.min(xml.length, 64 * 1024))
  const ref = /<(?:\w+:)?dimension\b[^>]*\bref="([^"]*)"/.exec(head)?.[1]
  const last = /\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref?.split(':').pop() ?? '')
  if (!last) return
  const columns = columnNumber(last[1]!)
  const rows = Number(last[2])
  if (rows > limits.rows || columns > limits.columns) {
    throw new TakeoffTooLargeError(
      `A sheet in this workbook uses ${rows.toLocaleString('en-PH')} rows and ${columns.toLocaleString('en-PH')} columns; the import reads at most ${limits.rows.toLocaleString('en-PH')} rows and ${limits.columns} columns. Delete the unused rows and columns (or copy the BOQ to a new workbook) and try again.`,
    )
  }
}

/**
 * Zip-bomb and size guard, run before ExcelJS inflates the workbook. Walks the
 * zip central directory and inflates each entry once with its declared size as
 * the output cap, so a lying size header fails here instead of filling memory.
 * A buffer that is not a zip is left to ExcelJS to reject.
 */
export function assertXlsxWithinLimits(buffer: Buffer, limits = XLSX_LIMITS): void {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0 || end + 22 > buffer.length) return
  const entries = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  const tooLarge = () =>
    new TakeoffTooLargeError(
      `The workbook expands to more than ${limits.uncompressedBytes / 1024 / 1024} MB. Remove unused sheets, images or formatting and try again.`,
    )
  // Zip64 markers only appear past 4 GB or 65,535 entries.
  if (entries === 0xffff || offset === 0xffffffff) throw tooLarge()

  let total = 0
  for (let entry = 0; entry < entries; entry += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const localHeader = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)

    total += size
    if (size === 0xffffffff || total > limits.uncompressedBytes) throw tooLarge()
    if (localHeader + 30 > buffer.length) return
    const dataStart =
      localHeader + 30 + buffer.readUInt16LE(localHeader + 26) + buffer.readUInt16LE(localHeader + 28)
    const data = buffer.subarray(dataStart, dataStart + compressedSize)
    const content = method === 8 ? inflateRawSync(data, { maxOutputLength: Math.max(size, 1) }) : data
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) checkDimension(content, limits)
  }
}

/**
 * Sheet rows 1..lastRow as raw values, at most TAKEOFF_MAX_COLUMNS wide (a
 * far-right stray cell must not widen every row). Merged-range followers read
 * as blank. Content below lastRow means the sheet is over the row cap.
 */
function worksheetGrid(worksheet: ExcelJS.Worksheet, lastRow: number): unknown[][] {
  const grid: unknown[][] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > lastRow) throw new TakeoffTooLargeError(TAKEOFF_TOO_MANY_ROWS_MESSAGE)
    const cells: unknown[] = []
    row.eachCell((cell, column) => {
      if (column > TAKEOFF_MAX_COLUMNS) return
      cells[column - 1] = cell.isMerged && cell.master.address !== cell.address ? null : cell.value
    })
    grid[rowNumber - 1] = Array.from(cells)
  })
  return Array.from(grid, (cells) => cells ?? [])
}

function csvGrid(text: string, lastRow: number): unknown[][] {
  const lines = text.split(/\r?\n/)
  if (lines.slice(lastRow).some((line) => line.trim())) {
    throw new TakeoffTooLargeError(TAKEOFF_TOO_MANY_ROWS_MESSAGE)
  }
  return lines.slice(0, lastRow).map(splitCsvLine)
}

function emptyResult(missingColumns: string[], headerRow = 1): StructuredTakeoffResult {
  return {
    rows: [],
    missingColumns,
    headers: [],
    headerRow,
    skippedRows: 0,
    sectionRows: 0,
    warnings: [],
  }
}

function columnIndexes(headers: string[], mapping: TakeoffColumnMapping): ColumnIndexes {
  const column = (field: MappedField) => findColumn(headers, field, mapping[field])
  return {
    sourceRowKey: mapping.sourceRowKey ? headers.indexOf(normalizeHeader(mapping.sourceRowKey)) : -1,
    description: column('description'),
    quantity: column('quantity'),
    unit: column('unit'),
    division: column('division'),
    location: column('location'),
    itemNo: column('itemNo'),
    notes: column('notes'),
    unitRate: column('unitRate'),
    amount: column('amount'),
  }
}

function classifyRow(
  cells: unknown[],
  indexes: ColumnIndexes,
  description: string,
  sectionHeaders: boolean,
): 'skip' | 'section' | 'item' {
  if (isBlankRow(cells) || TOTAL_ROW.test(description)) return 'skip'
  // A lump sum (rate or amount, no quantity) is an item Core queues, not a header.
  const isHeader = [indexes.quantity, indexes.unit, indexes.unitRate, indexes.amount].every(
    (index) => index < 0 || isBlankCell(cells[index]),
  )
  return sectionHeaders && isHeader ? 'section' : 'item'
}

function readQuantity(cell: unknown, warn: Warn): CellNumber<string> {
  const quantity = cellQuantity(cell)
  if (!quantity.ok) {
    if (quantity.problem !== 'BLANK') {
      warn('UNREADABLE_QUANTITY', `Quantity ${PROBLEM_TEXT[quantity.problem]}.`)
    }
    return quantity
  }
  // cellDecimal already dropped Excel's float noise, so extra digits are real.
  const original = cellDecimal(cell)
  if (original.ok && (original.value.split('.')[1]?.length ?? 0) > 4) {
    warn('QUANTITY_ROUNDED', `Quantity ${original.value} was rounded to ${quantity.value}.`)
  }
  return quantity
}

/** Mapped rate: centavos, null when unreadable (Core queues it), undefined when blank. */
function readRate(cell: unknown, warn: Warn): number | null | undefined {
  const rate = cellCentavos(cell, TAKEOFF_MAX_UNIT_RATE_CENTAVOS)
  if (rate.ok) return rate.value
  if (rate.problem === 'BLANK') return undefined
  warn('UNREADABLE_UNIT_RATE', `Unit rate ${PROBLEM_TEXT[rate.problem]}.`)
  return null
}

function checkAmount(
  cell: unknown,
  quantity: CellNumber<string>,
  unitRateCentavos: number | null | undefined,
  warn: Warn,
): void {
  const amount = cellCentavos(cell, Number.MAX_SAFE_INTEGER)
  if (!amount.ok) {
    if (amount.problem !== 'BLANK') warn('UNREADABLE_AMOUNT', `Amount ${PROBLEM_TEXT[amount.problem]}.`)
    return
  }
  if (!quantity.ok || typeof unitRateCentavos !== 'number') return
  let expected: number
  try {
    expected = lineTotal(unitRateCentavos, quantity.value, 0)
  } catch {
    return // Out of range: validateTakeoffRows queues the rate in Core.
  }
  if (Math.abs(expected - amount.value) > 1) {
    warn(
      'AMOUNT_MISMATCH',
      `Amount PHP ${formatCentavos(amount.value)} differs from quantity x unit rate PHP ${formatCentavos(expected)}; the system amount is used.`,
    )
  }
}

interface RowContext {
  headers: string[]
  indexes: ColumnIndexes
  warnings: TakeoffRowWarning[]
}

function buildRow(
  cells: unknown[],
  rowNumber: number,
  section: string | null,
  { headers, indexes, warnings }: RowContext,
): StructuredTakeoffRow {
  const text = (index: number) => (index >= 0 ? cellText(cells[index]).trim() : '')
  const sourceRowKey = text(indexes.sourceRowKey) || `row-${rowNumber}`
  const warn: Warn = (code, message) => warnings.push({ sourceRowKey, code, message })
  const quantity = readQuantity(cells[indexes.quantity], warn)
  const unitRateCentavos = indexes.unitRate >= 0 ? readRate(cells[indexes.unitRate], warn) : undefined
  if (indexes.amount >= 0) checkAmount(cells[indexes.amount], quantity, unitRateCentavos, warn)

  return {
    sourceRowKey,
    description: text(indexes.description),
    quantity: quantity.ok ? Number(quantity.value) : null,
    unit: normalizeUnit(text(indexes.unit)),
    division: text(indexes.division) || section,
    location: text(indexes.location) || null,
    itemNo: text(indexes.itemNo) || null,
    notes: text(indexes.notes) || null,
    ...(unitRateCentavos === undefined ? {} : { unitRateCentavos }),
    raw: Object.fromEntries(headers.map((header, index) => [header, cellText(cells[index])])),
  }
}

function buildRows(
  grid: unknown[][],
  mapping: TakeoffColumnMapping,
  options: TakeoffParseOptions,
): StructuredTakeoffResult {
  const headerRow = options.headerRow ?? detectHeaderRow(grid, mapping)
  const headers = (grid[headerRow - 1] ?? []).map((cell) => normalizeHeader(cellText(cell)))
  const indexes = columnIndexes(headers, mapping)
  const missingColumns = REQUIRED_FIELDS.filter(([field]) => indexes[field] < 0).map(([, label]) => label)
  if (missingColumns.length > 0) return { ...emptyResult(missingColumns, headerRow), headers }

  const result: StructuredTakeoffResult = { ...emptyResult([], headerRow), headers }
  const context: RowContext = { headers, indexes, warnings: result.warnings }
  const sectionHeaders = options.sectionHeaders ?? true
  let lastRow = grid.length
  while (lastRow > headerRow && isBlankRow(grid[lastRow - 1] ?? [])) lastRow -= 1
  let section: string | null = null

  // One row past the limit is enough for the caller to reject the file.
  for (
    let rowNumber = headerRow + 1;
    rowNumber <= lastRow && result.rows.length <= TAKEOFF_IMPORT_MAX_ROWS;
    rowNumber += 1
  ) {
    const cells = grid[rowNumber - 1] ?? []
    const description = cellText(cells[indexes.description]).trim()
    const kind = classifyRow(cells, indexes, description, sectionHeaders)
    if (kind === 'skip') {
      result.skippedRows += 1
    } else if (kind === 'section') {
      // A header merged from an earlier column has its text outside Description.
      section = description || cells.map((cell) => cellText(cell).trim()).find(Boolean) || null
      result.sectionRows += 1
    } else {
      result.rows.push(buildRow(cells, rowNumber, section, context))
    }
  }
  return result
}

export async function parseStructuredTakeoff(
  buffer: Buffer,
  fileName: string,
  mapping: TakeoffColumnMapping,
  options: TakeoffParseOptions = {},
): Promise<StructuredTakeoffResult> {
  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith('.csv')) {
    const text = buffer.toString('utf8')
    if (text.trim().length === 0) return emptyResult(['file'])
    return buildRows(csvGrid(text, lastReadRow(options)), mapping, options)
  }

  if (lowerName.endsWith('.xlsx')) {
    assertXlsxWithinLimits(buffer)
    const workbook = new ExcelJS.Workbook()
    // ExcelJS' runtime accepts Node Buffers, while its declaration is typed
    // as an ArrayBuffer in this version of the package.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const sheets = workbook.worksheets.map((sheet) => sheet.name)
    const worksheet = options.sheet
      ? workbook.getWorksheet(options.sheet)
      : workbook.worksheets[0]
    if (!worksheet) {
      return { ...emptyResult(['worksheet']), workbook: { sheets, sheet: options.sheet ?? '' } }
    }
    return {
      ...buildRows(worksheetGrid(worksheet, lastReadRow(options)), mapping, options),
      workbook: { sheets, sheet: worksheet.name },
    }
  }

  throw new Error(`Unsupported takeoff format: ${fileName}`)
}

export function buildTakeoffImportKey(
  source: string,
  drawingRevisionKey: string,
  fileDigest: string,
): string {
  return createHash('sha256')
    .update(`${source.trim().toLowerCase()}\n${drawingRevisionKey}\n${fileDigest}`)
    .digest('hex')
}

export function sha256Digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
