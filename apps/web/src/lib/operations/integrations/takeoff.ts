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
  TAKEOFF_IMPORT_MAX_COMMAND_BYTES,
  TAKEOFF_IMPORT_MAX_ROWS,
  TAKEOFF_MAX_UNIT_RATE_CENTAVOS,
} from '@third-code-erp/shared-types'
import {
  cellCentavos,
  cellDecimal,
  cellQuantity,
  cellText,
  formatCentavos,
  MAX_CELL_TEXT,
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
  | 'AMOUNT_IGNORED'
  | 'TEXT_TRUNCATED'
  | 'TOTAL_ROW_SKIPPED'
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

// Core refuses a command over TAKEOFF_IMPORT_MAX_COMMAND_BYTES. Rows are
// counted as they are built, so the size is known before the whole command is
// in memory; the margin covers the fields around the rows.
const ROWS_BYTE_BUDGET = TAKEOFF_IMPORT_MAX_COMMAND_BYTES - 64 * 1024
export const TAKEOFF_TOO_MUCH_DATA_MESSAGE = `The rows on this sheet hold more than ${TAKEOFF_IMPORT_MAX_COMMAND_BYTES / 1_000_000} MB of data. Split the sheet and import each part.`

export const XLSX_LIMITS = {
  uncompressedBytes: 100 * 1024 * 1024,
  rows: 20_000,
  columns: TAKEOFF_MAX_COLUMNS,
  // Workbook parts (zip entries); a real estimate has a few hundred.
  entries: 5_000,
  // Rows, cells and merged cells over every sheet: ExcelJS loads all sheets
  // and keeps about 500 bytes for each (measured), so this is about 250 MB.
  cells: 500_000,
  // ExcelJS checks each merged range against every other one on the sheet.
  mergedRangesPerSheet: 10_000,
}

// Worksheet nodes the import never reads. ExcelJS expands column spans and
// data-validation ranges into one object per column or cell on load, so they
// are not parsed at all; only sheetData and mergeCells are.
const IGNORED_SHEET_NODES = [
  'sheetPr',
  'dimension',
  'sheetViews',
  'sheetFormatPr',
  'cols',
  'autoFilter',
  'rowBreaks',
  'hyperlinks',
  'pageMargins',
  'dataValidations',
  'pageSetup',
  'headerFooter',
  'printOptions',
  'picture',
  'drawing',
  'sheetProtection',
  'tableParts',
  'conditionalFormatting',
  'extLst',
]

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

const ZIP_END = Buffer.from([0x50, 0x4b, 0x05, 0x06])
const ZIP_DIRECTORY_ENTRY = 0x02014b50
const ZIP_LOCAL_ENTRY = 0x04034b50
const ROW_OR_CELL_TAG = /<(?:\w+:)?(?:c|row)[\s/>]/g
const MERGE_TAG = /<(?:\w+:)?mergeCell\b([^>]*)>/g
const REF_ATTRIBUTE = /\sref\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const CELL_RANGE = /^\$?([A-Z]{1,3})\$?(\d{1,7})(?::\$?([A-Z]{1,3})\$?(\d{1,7}))?$/

/** A zip or sheet the guard cannot fully account for is refused, never passed on. */
function unreadable(reason: string): Error {
  return new Error(`Not a readable .xlsx workbook: ${reason}.`)
}

/** One entry's bytes, inflated once with its declared size as the output cap. */
function zipEntryContent(method: number, data: Buffer, size: number): Buffer {
  if (method !== 0 && method !== 8) throw unreadable('unsupported compression')
  let content = data
  if (method === 8 && data.length > 0) {
    try {
      content = inflateRawSync(data, { maxOutputLength: Math.max(size, 1) })
    } catch {
      throw unreadable('a part does not match its declared size')
    }
  }
  if (content.length !== size) throw unreadable('a part does not match its declared size')
  return content
}

/**
 * What ExcelJS turns into one object each in a sheet part: rows, cells and
 * every cell a merged range covers. Stops counting once past the limit.
 */
function countSheetObjects(xml: string, limits: typeof XLSX_LIMITS): number {
  let count = 0
  for (const _tag of xml.matchAll(ROW_OR_CELL_TAG)) {
    count += 1
    if (count > limits.cells) return count
  }
  let ranges = 0
  for (const [, attributes = ''] of xml.matchAll(MERGE_TAG)) {
    ranges += 1
    if (ranges > limits.mergedRangesPerSheet) {
      throw new TakeoffTooLargeError(
        `A sheet in this workbook has more than ${limits.mergedRangesPerSheet.toLocaleString('en-PH')} merged ranges. Unmerge the cells (or copy the BOQ to a new workbook) and try again.`,
      )
    }
    // Exactly one plain ref ("A1:B2"): anything ExcelJS might read differently is refused.
    const refs = [...attributes.matchAll(REF_ATTRIBUTE)]
    const range = refs.length === 1 ? CELL_RANGE.exec(refs[0]![1] ?? refs[0]![2] ?? '') : null
    if (!range) throw unreadable('a merged range is not a plain cell range')
    const [, startColumn = '', startRow, endColumn = startColumn, endRow = startRow] = range
    count +=
      (Math.abs(columnNumber(endColumn) - columnNumber(startColumn)) + 1) *
      (Math.abs(Number(endRow) - Number(startRow)) + 1)
    if (count > limits.cells) return count
  }
  return count
}

/**
 * Zip-bomb and size guard, run before ExcelJS (which reads the zip with JSZip)
 * loads the workbook. It fails closed: the zip must be exactly what JSZip will
 * read (one directory that ends where its end record starts, the declared
 * number of entries, stored or deflated data inside the file); each entry is
 * inflated once with its declared size as the output cap; and the sheet XML is
 * counted instead of trusting <dimension>, so nothing that would expand past
 * the limits reaches ExcelJS.
 */
export function assertXlsxWithinLimits(buffer: Buffer, limits = XLSX_LIMITS): void {
  const end = buffer.lastIndexOf(ZIP_END)
  if (end < 0 || end + 22 > buffer.length) throw unreadable('no zip directory')
  const entries = buffer.readUInt16LE(end + 10)
  const directoryStart = buffer.readUInt32LE(end + 16)
  // One disk, no zip64, and no bytes before or between the parts: JSZip
  // re-bases every offset when the directory is not where its end record says.
  if (
    buffer.readUInt32LE(end + 4) !== 0 ||
    buffer.readUInt16LE(end + 8) !== entries ||
    entries === 0xffff ||
    directoryStart + buffer.readUInt32LE(end + 12) !== end
  ) {
    throw unreadable('unsupported zip layout')
  }
  if (entries > limits.entries) {
    throw new TakeoffTooLargeError(
      `The workbook has more than ${limits.entries.toLocaleString('en-PH')} parts. Copy the BOQ to a new workbook and try again.`,
    )
  }

  let offset = directoryStart
  let total = 0
  let cells = 0
  for (let entry = 0; entry < entries; entry += 1) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== ZIP_DIRECTORY_ENTRY) {
      throw unreadable('the zip directory does not match its entry count')
    }
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const localHeader = buffer.readUInt32LE(offset + 42)
    offset +=
      46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)

    total += size
    if (total > limits.uncompressedBytes) {
      throw new TakeoffTooLargeError(
        `The workbook expands to more than ${limits.uncompressedBytes / 1024 / 1024} MB. Remove unused sheets, images or formatting and try again.`,
      )
    }
    if (localHeader + 30 > directoryStart || buffer.readUInt32LE(localHeader) !== ZIP_LOCAL_ENTRY) {
      throw unreadable('a part is outside the file')
    }
    const dataStart =
      localHeader + 30 + buffer.readUInt16LE(localHeader + 26) + buffer.readUInt16LE(localHeader + 28)
    if (dataStart + compressedSize > directoryStart) throw unreadable('a part is outside the file')
    const content = zipEntryContent(method, buffer.subarray(dataStart, dataStart + compressedSize), size)

    // By content, not by name: JSZip names parts from their local headers.
    if (!content.includes('sheetData') && !content.includes('mergeCell')) continue
    checkDimension(content, limits)
    cells += countSheetObjects(content.toString('latin1'), limits)
    if (cells > limits.cells) {
      throw new TakeoffTooLargeError(
        `The workbook holds more than ${limits.cells.toLocaleString('en-PH')} rows and cells over all its sheets (a merged range counts every cell it covers). Copy the BOQ sheet to a new workbook and try again.`,
      )
    }
  }
  if (offset !== end) throw unreadable('the zip directory does not match its entry count')
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

/**
 * CSV records 1..lastRow, each at most TAKEOFF_MAX_COLUMNS trimmed cells. A
 * cell that starts with a quote may hold commas, doubled quotes and line
 * breaks, so a record is not always one line; a quote later in a cell is plain
 * text (2" pipe). Content after lastRow means the file is over the row cap.
 */
function csvGrid(text: string, lastRow: number): unknown[][] {
  const rows: string[][] = []
  let cells: string[] = []
  let current = ''
  let quoted = false
  const endCell = () => {
    if (cells.length < TAKEOFF_MAX_COLUMNS) cells.push(current.trim())
    current = ''
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (character === '"' && (quoted || current.trim() === '')) {
      if (quoted && text[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      endCell()
    } else if (character === '\n' && !quoted) {
      endCell()
      rows.push(cells)
      cells = []
      if (rows.length === lastRow) {
        if (/\S/.test(text.slice(index + 1))) throw new TakeoffTooLargeError(TAKEOFF_TOO_MANY_ROWS_MESSAGE)
        return rows
      }
    } else {
      current += character
    }
  }
  endCell()
  rows.push(cells)
  return rows
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
  // A total row has no unit; "Total station survey | 1 | lot" is a real line.
  const isTotal = TOTAL_ROW.test(description) && isBlankCell(cells[indexes.unit])
  if (isBlankRow(cells) || isTotal) return 'skip'
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
  if (unitRateCentavos === undefined) {
    // Nothing prices the line: an amount is only ever checked, never imported.
    if (amount.value > 0) {
      warn(
        'AMOUNT_IGNORED',
        `Amount PHP ${formatCentavos(amount.value)} has no unit rate, so the line is imported without a price. Map a unit rate column or price the line after import.`,
      )
    }
    return
  }
  if (!quantity.ok || unitRateCentavos === null) return
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
  for (const [label, index] of [
    ['Description', indexes.description],
    ['Notes', indexes.notes],
  ] as const) {
    if (index >= 0 && cellText(cells[index], MAX_CELL_TEXT + 1).length > MAX_CELL_TEXT) {
      warn(
        'TEXT_TRUNCATED',
        `${label} is longer than ${MAX_CELL_TEXT.toLocaleString('en-PH')} characters and was cut.`,
      )
    }
  }

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
  let rowBytes = 0

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
      // Not blank, so a total row; with a quantity it may be a line missing its unit.
      if (description && !isBlankCell(cells[indexes.quantity])) {
        result.warnings.push({
          sourceRowKey: `row-${rowNumber}`,
          code: 'TOTAL_ROW_SKIPPED',
          message: `"${description.slice(0, 80)}" has a quantity but no unit; it was read as a total row and not imported.`,
        })
      }
    } else if (kind === 'section') {
      // A header merged from an earlier column has its text outside Description.
      section = description || cells.map((cell) => cellText(cell).trim()).find(Boolean) || null
      result.sectionRows += 1
    } else {
      const row = buildRow(cells, rowNumber, section, context)
      rowBytes += Buffer.byteLength(JSON.stringify(row))
      if (rowBytes > ROWS_BYTE_BUDGET) throw new TakeoffTooLargeError(TAKEOFF_TOO_MUCH_DATA_MESSAGE)
      result.rows.push(row)
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
    // ExcelJS expands every defined-name range into one object per cell when
    // it applies the loaded workbook. The import never reads names, so an
    // inert holder takes them instead (takeoff.test.ts loads a whole-sheet name).
    Object.assign(workbook, { _definedNames: { model: [] } })
    // ExcelJS' runtime accepts Node Buffers, while its declaration is typed
    // as an ArrayBuffer in this version of the package.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer, { ignoreNodes: IGNORED_SHEET_NODES })
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
