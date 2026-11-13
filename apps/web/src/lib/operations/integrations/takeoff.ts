import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
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
import { readXlsxSheet, TakeoffTooLargeError } from './takeoff-xlsx-reader'

export { validateTakeoffRows }
export { TakeoffBusyError, TakeoffTooLargeError } from './takeoff-xlsx-reader'
export type { StructuredTakeoffRow, TakeoffValidationIssue }

export interface TakeoffColumnMapping {
  sourceRowKey?: string
  description: string
  quantity: string
  unit: string
  division?: string
  location?: string
  itemNo?: string
  code?: string
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
  | 'AMOUNT_NOT_EXACT'
  | 'LUMP_SUM'
  | 'HIDDEN_ROW'
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

/** A row with an amount that was skipped instead of becoming a priced line (A.3, A.5). */
export interface SkippedAmountRow {
  /** The sheet read (.xlsx); null for CSV. */
  sheet: string | null
  /** Sheet row number (CSV: record number). */
  row: number
  /** Its description, or its first text when the description is blank. */
  label: string
  /** The amount in pesos as an exact decimal, e.g. "85,000.00". */
  amount: string
  reason: string
}

export interface StructuredTakeoffResult {
  rows: StructuredTakeoffRow[]
  missingColumns: string[]
  headers: string[]
  headerRow: number
  /** Blank, total/subtotal and amount-only rows below the header. */
  skippedRows: number
  /** Each skipped row that carries an amount, so no total is dropped unseen. */
  skippedAmountRows: SkippedAmountRow[]
  /** Section header rows that set a division instead of importing. */
  sectionRows: number
  warnings: TakeoffRowWarning[]
  /** Present for .xlsx: every sheet name and the one read. */
  workbook?: { sheets: string[]; sheet: string }
}

export const TAKEOFF_MAX_HEADER_ROW = 50
export const TAKEOFF_MAX_COLUMNS = 64
export const TAKEOFF_TOO_MANY_ROWS_MESSAGE = `The sheet has more than ${TAKEOFF_IMPORT_MAX_ROWS.toLocaleString('en-PH')} rows. Split it and import each part.`

// Core refuses a command over TAKEOFF_IMPORT_MAX_COMMAND_BYTES. Rows are
// counted as they are built, so the size is known before the whole command is
// in memory; the margin covers the fields around the rows.
const ROWS_BYTE_BUDGET = TAKEOFF_IMPORT_MAX_COMMAND_BYTES - 64 * 1024
export const TAKEOFF_TOO_MUCH_DATA_MESSAGE = `The rows on this sheet hold more than ${TAKEOFF_IMPORT_MAX_COMMAND_BYTES / 1_000_000} MB of data. Split the sheet and import each part.`

// The rows read from the chosen sheet cross from the reader's child process to the
// server process as text. Rows over the command budget are refused anyway, so
// twice that budget is room for the rows above the header and the skipped ones.
const GRID_TEXT_BUDGET = 2 * TAKEOFF_IMPORT_MAX_COMMAND_BYTES

// Whole-workbook limits of the first filter. They say nothing about the sheet
// being imported (the reader checks that sheet): ExcelJS loads every sheet, so
// these only turn away a workbook the reader could not hold or finish.
export const XLSX_LIMITS = {
  uncompressedBytes: 100 * 1024 * 1024,
  // Workbook parts (zip entries); a real estimate has a few hundred.
  entries: 5_000,
  // Rows, cells and merged cells over every sheet: ExcelJS keeps about 500
  // bytes for each (measured), which is about half of the reader's heap cap.
  cells: 500_000,
  // ExcelJS checks each merged range against every other one on its sheet;
  // 10,000 on one sheet took about 9 seconds.
  mergedRanges: 5_000,
  // XML over every part (sheets, shared strings, styles, comments, drawings):
  // ExcelJS holds about 12 bytes for each, so this keeps a read near 400 MB.
  // Images are not XML and only count toward uncompressedBytes.
  xmlBytes: 32 * 1024 * 1024,
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
  code: ['code'],
  notes: ['notes', 'remarks'],
  unitRate: ['unit rate (php)', 'unit rate', 'rate', 'unit cost', 'unit price'],
  amount: ['amount (php)', 'amount', 'total amount'],
}

const REQUIRED_FIELDS = [
  ['description', 'Description'],
  ['quantity', 'Quantity'],
  ['unit', 'UOM'],
] as const

// "Total", "Subtotal", "Sub-total", "Sub Total", "Grand total".
const TOTAL_ROW = /^(grand\s+|sub[\s-]*)?total\b/i
// boq-excel A.5 (owner decision 2026-11-13): an amount with no quantity is a
// lump sum only when the unit says so. Any other such row (TOTAL, VAT, a
// subtotal under another name) is skipped and listed, never priced.
const LUMP_SUM_UNITS = new Set(['ls', 'l.s.', 'lot'])
const TOTAL_ROW_REASON = 'Total row (its description starts with Total, Subtotal or Grand total and it has no unit).'
const AMOUNT_ONLY_REASON =
  'Amount with no quantity: only a row whose unit is ls, l.s. or lot is imported as a lump sum.'

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

/** The first non-blank text of a row, for a label merged from an earlier column. */
function firstText(cells: readonly unknown[]): string {
  return cells.map((cell) => cellText(cell).trim()).find(Boolean) ?? ''
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

const ZIP_END = Buffer.from([0x50, 0x4b, 0x05, 0x06])
const ZIP_DIRECTORY_ENTRY = 0x02014b50
const ZIP_LOCAL_ENTRY = 0x04034b50
// A sheet part is scanned once, linearly and with no character window, for
// every tag that carries an index. A tag is read from its name one attribute
// at a time, in order, to its `>`, and refused unless that consumes it
// exactly. A value may not hold `<` or `>`: XML forbids the first, Excel
// escapes the second, and a `>` inside a value let a decoy attribute stand in
// for the real one (S5-2). So a read never passes the next `<`.
// Names are ASCII and end at the first character that is not an ASCII name
// character, so whatever follows a name is read here and refused unless it is
// XML 1.0 white space: an XML 1.1 line break (U+0085, U+2028) after a name is
// white space to saxes and hid the index behind it from this scan (S6-1).
// Only the unprefixed names: ExcelJS matches a tag by its literal name, so
// <xdr:row> and <xdr:col> (the anchor of a form control or an embedded
// object, which Excel writes inside the sheet part) are not index tags.
const SHEET_TAG = /<(row|c|col|dimension|mergeCell)(?![\w.:-])/g
const TAG_ATTRIBUTE = /[ \t\r\n]+([\w.:-]+)[ \t\r\n]*=[ \t\r\n]*(?:"([^"<>]*)"|'([^'<>]*)')/y
const TAG_END = /[ \t\r\n]*\/?>/y
// Every sheetId in a scanned part, whatever follows it: it must be an
// attribute with a quoted number, read in full.
const SHEET_ID = /\bsheetId(?![\w.:-])/g
const SHEET_ID_VALUE = /[ \t\r\n]*=[ \t\r\n]*(?:"(\d{1,5})"|'(\d{1,5})')/y
// The scans know XML 1.0 white space only, and saxes switches to XML 1.1
// rules on any other declared version. Every XML declaration in a scanned part
// must be a whole, plain 1.0 one.
const XML_DECLARATION = /<\?xml(?![\w.:-])/gi
const XML_DECLARATION_1_0 =
  /[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"1\.0"|'1\.0')(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"[\w.-]+"|'[\w.-]+'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\r\n]*\?>/y
const CELL_ADDRESS = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/
// ExcelJS keeps sheets, rows and columns in arrays indexed by these numbers
// and walks or fills the whole index range, so one absurd index is minutes of
// CPU or gigabytes of memory.
const MAX_SHEET_ID = 65_535
const MAX_SHEET_ROW = 1_048_576
const MAX_SHEET_COLUMN = 16_384

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
 * Whether ExcelJS will parse a part as XML. By content, as the other checks:
 * a part's name can also come from a zip extra field.
 */
function isXmlPart(content: Buffer): boolean {
  let at = content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf ? 3 : 0
  while (at < content.length && (content[at] === 0x20 || content[at] === 0x09 || content[at] === 0x0a || content[at] === 0x0d)) {
    at += 1
  }
  return content[at] === 0x3c
}

/** Rows, cells and merged cells, and merged ranges, counted over the workbook so far. */
interface WorkbookCounts {
  cells: number
  mergedRanges: number
}

type TagAttributes = ReadonlyArray<readonly [name: string, value: string]>

/**
 * The attributes of the tag whose name ends at `from`, in order and as written
 * (entities are not decoded); null unless the rest of the tag is exactly
 * `name="value"` or `name='value'` pairs and its `>`.
 */
function tagAttributes(xml: string, from: number): TagAttributes | null {
  const attributes: Array<readonly [string, string]> = []
  for (let at = from; ; at = TAG_ATTRIBUTE.lastIndex) {
    TAG_END.lastIndex = at
    if (TAG_END.test(xml)) return attributes
    TAG_ATTRIBUTE.lastIndex = at
    const match = TAG_ATTRIBUTE.exec(xml)
    if (!match) return null
    attributes.push([match[1] ?? '', match[2] ?? match[3] ?? ''])
  }
}

/** Each value one attribute is given in a tag. */
function valuesOf(attributes: TagAttributes, name: string): string[] {
  return attributes.filter(([key]) => key === name).map(([, value]) => value)
}

function isSheetRow(value: string): boolean {
  return /^\d{1,7}$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_SHEET_ROW
}

function isSheetColumn(value: string): boolean {
  return /^\d{1,5}$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_SHEET_COLUMN
}

/** "B7" inside the sheet -> its column and row; null for anything else. */
function cellIndex(address: string): { column: number; row: number } | null {
  const match = CELL_ADDRESS.exec(address)
  if (!match) return null
  const [, letters = '', row = ''] = match
  const column = columnNumber(letters)
  return column <= MAX_SHEET_COLUMN && isSheetRow(row) ? { column, row: Number(row) } : null
}

/** "A1" or "A1:B2" inside the sheet -> the cells it covers; null for anything else. */
function rangeCells(ref: string): number | null {
  const [first = '', last = first, ...extra] = ref.split(':')
  const start = cellIndex(first)
  const end = cellIndex(last)
  if (!start || !end || extra.length > 0) return null
  return (Math.abs(end.column - start.column) + 1) * (Math.abs(end.row - start.row) + 1)
}

/** Why a tag of this name is refused. */
function unreadableTag(name: string): Error {
  switch (name) {
    case 'row':
      return unreadable('a row number is missing or outside the sheet')
    case 'c':
      return unreadable('a cell reference is outside the sheet')
    case 'col':
      return unreadable('a column range is outside the sheet')
    case 'dimension':
      return unreadable('the sheet dimension is outside the sheet')
    default:
      return unreadable('a merged range is not a plain cell range inside the sheet')
  }
}

/**
 * What one index tag makes ExcelJS build: its objects (a row, a cell, every
 * cell a merged range covers) and the column it reaches. Null when an index
 * is missing, repeated, unreadable or outside the sheet.
 */
function tagObjects(name: string, attributes: TagAttributes): { objects: number; column: number } | null {
  if (name === 'row') {
    // ExcelJS indexes its rows by r, read with parseInt (which drops trailing junk).
    const numbers = valuesOf(attributes, 'r')
    return numbers.length === 1 && isSheetRow(numbers[0] ?? '') ? { objects: 1, column: 0 } : null
  }
  if (name === 'c') {
    // A cell without r is the column after the one before it (ExcelJS stops past XFD).
    const refs = valuesOf(attributes, 'r')
    if (refs.length === 0) return { objects: 1, column: 0 }
    const cell = refs.length === 1 ? cellIndex(refs[0] ?? '') : null
    return cell ? { objects: 1, column: cell.column } : null
  }
  if (name === 'col') {
    // Not parsed (IGNORED_SHEET_NODES); checked so no future parse walks an absurd range.
    const min = valuesOf(attributes, 'min')
    const max = valuesOf(attributes, 'max')
    return min.length === 1 && max.length === 1 && [...min, ...max].every(isSheetColumn)
      ? { objects: 0, column: 0 }
      : null
  }
  // <dimension> (not parsed, checked as <col>) and <mergeCell>: one plain range inside the sheet.
  const refs = valuesOf(attributes, 'ref')
  const area = refs.length === 1 ? rangeCells(refs[0] ?? '') : null
  return area === null ? null : { objects: name === 'mergeCell' ? area : 0, column: 0 }
}

/**
 * Adds what ExcelJS turns into one object each in a sheet part: rows, cells,
 * the columns up to the last one a cell is in, and every cell a merged range
 * covers. Stops counting cells once past the limit. Refuses every index
 * ExcelJS allocates from that it cannot read or that lies outside a sheet
 * (row numbers, cell references, column ranges, the dimension, merged ranges)
 * and too many merged ranges. One pass over the part.
 */
function countSheetPart(xml: string, limits: typeof XLSX_LIMITS, counted: WorkbookCounts): WorkbookCounts {
  let { cells, mergedRanges } = counted
  let lastColumn = 0
  for (const match of xml.matchAll(SHEET_TAG)) {
    const name = match[1] ?? ''
    const attributes = tagAttributes(xml, match.index + match[0].length)
    const built = attributes ? tagObjects(name, attributes) : null
    if (!built) throw unreadableTag(name)
    if (name === 'mergeCell') mergedRanges += 1
    if (mergedRanges > limits.mergedRanges) {
      throw new TakeoffTooLargeError(
        `The workbook has more than ${limits.mergedRanges.toLocaleString('en-PH')} merged ranges. Unmerge the cells (or copy the BOQ to a new workbook) and try again.`,
      )
    }
    cells += built.objects
    lastColumn = Math.max(lastColumn, built.column)
    if (cells > limits.cells) break
  }
  // ExcelJS creates every column up to the last one a cell is in.
  return { cells: cells + lastColumn, mergedRanges }
}

/**
 * Zip-bomb and size guard: a cheap, linear first filter in front of the
 * workbook reader (ExcelJS, which reads the zip with JSZip, in a child process with
 * its own heap and time limits). It fails closed on the zip: it must be
 * exactly what JSZip will read (one directory that ends where its end record
 * starts, the declared number of entries, stored or deflated data inside the
 * file), and each entry is inflated once with its declared size as the output
 * cap. It also refuses what is cheap to see in the XML: too much XML, too
 * many rows, cells or merged ranges over the workbook, and any sheet id, row
 * number, cell reference, column range, dimension or merged range it cannot
 * read or that would make ExcelJS walk or fill a huge index range. It does not
 * try to model everything ExcelJS expands; the reader's limits cover the rest.
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
  let xmlBytes = 0
  let counted: WorkbookCounts = { cells: 0, mergedRanges: 0 }
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
    const isSheet = content.includes('sheetData') || content.includes('mergeCell')
    const isScanned = isSheet || content.includes('sheetId')
    // A part scanned below counts even when it does not start like XML, so the
    // scans never read more than the XML budget (S5-3).
    if (isScanned || isXmlPart(content)) {
      xmlBytes += content.length
      if (xmlBytes > limits.xmlBytes) {
        throw new TakeoffTooLargeError(
          `The workbook holds more than ${limits.xmlBytes / 1024 / 1024} MB of sheet data, text and formatting. Copy the BOQ sheet to a new workbook and try again.`,
        )
      }
    }
    if (!isScanned) continue
    const xml = content.toString('latin1')
    for (const declaration of xml.matchAll(XML_DECLARATION)) {
      XML_DECLARATION_1_0.lastIndex = declaration.index + declaration[0].length
      if (!XML_DECLARATION_1_0.test(xml)) throw unreadable('a part is not plain XML 1.0')
    }
    for (const match of xml.matchAll(SHEET_ID)) {
      SHEET_ID_VALUE.lastIndex = match.index + match[0].length
      const [, double, single] = SHEET_ID_VALUE.exec(xml) ?? []
      const id = double ?? single
      if (id === undefined || Number(id) > MAX_SHEET_ID) {
        throw unreadable('a sheet id is unreadable or out of range')
      }
    }
    if (!isSheet) continue
    counted = countSheetPart(xml, limits, counted)
    if (counted.cells > limits.cells) {
      throw new TakeoffTooLargeError(
        `The workbook holds more than ${limits.cells.toLocaleString('en-PH')} rows and cells over all its sheets (a merged range counts every cell it covers). Copy the BOQ sheet to a new workbook and try again.`,
      )
    }
  }
  if (offset !== end) throw unreadable('the zip directory does not match its entry count')
}

/**
 * The chosen sheet's rows 1..lastRow as plain values, read by ExcelJS in a
 * child process under the reader's heap and time limits. The sheet's own limits are
 * checked there, on that sheet only: at most TAKEOFF_MAX_COLUMNS columns,
 * nothing below lastRow, and a bounded amount of text. Null when the workbook
 * has no such sheet.
 */
async function readWorksheet(
  buffer: Buffer,
  options: TakeoffParseOptions,
): Promise<{ sheets: string[]; sheet: string | null; grid: unknown[][]; hiddenRows: number[] }> {
  const read = await readXlsxSheet(buffer, {
    sheet: options.sheet,
    lastRow: lastReadRow(options),
    maxColumns: TAKEOFF_MAX_COLUMNS,
    // One past the cut, so a cut cell can be told from one that just fits.
    maxText: MAX_CELL_TEXT + 1,
    maxGridText: GRID_TEXT_BUDGET,
    ignoreNodes: IGNORED_SHEET_NODES,
  })
  if (read.sheet === null) return { sheets: read.sheets, sheet: null, grid: [], hiddenRows: [] }
  if ('refused' in read) {
    if (read.refused === 'TOO_WIDE') {
      throw new TakeoffTooLargeError(
        `The sheet "${read.sheet}" uses ${read.columns.toLocaleString('en-PH')} columns; the import reads at most ${TAKEOFF_MAX_COLUMNS}. Delete the unused columns (or copy the BOQ to a new sheet) and try again.`,
      )
    }
    throw new TakeoffTooLargeError(
      read.refused === 'TOO_MANY_ROWS' ? TAKEOFF_TOO_MANY_ROWS_MESSAGE : TAKEOFF_TOO_MUCH_DATA_MESSAGE,
    )
  }
  return {
    sheets: read.sheets,
    sheet: read.sheet,
    grid: Array.from(read.grid, (cells) => cells ?? []),
    hiddenRows: read.hiddenRows,
  }
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
  // Whether `current` holds non-blank text, kept as characters are added: trimming
  // `current` at every quote made one cell of quotes quadratic (S5-1).
  let hasText = false
  let quoted = false
  const endCell = () => {
    if (cells.length < TAKEOFF_MAX_COLUMNS) cells.push(current.trim())
    current = ''
    hasText = false
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (character === '"' && (quoted || !hasText)) {
      if (quoted && text[index + 1] === '"') {
        current += '"'
        hasText = true
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
      hasText ||= /\S/.test(character)
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
    skippedAmountRows: [],
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
    code: column('code'),
    notes: column('notes'),
    unitRate: column('unitRate'),
    amount: column('amount'),
  }
}

/** The mapped amount in centavos when it is above zero; null otherwise. */
function positiveAmount(cells: unknown[], indexes: ColumnIndexes): number | null {
  if (indexes.amount < 0) return null
  const amount = cellCentavos(cells[indexes.amount], Number.MAX_SAFE_INTEGER)
  return amount.ok && amount.value > 0 ? amount.value : null
}

type RowKind = 'blank' | 'total' | 'amountOnly' | 'section' | 'item'

function classifyRow(
  cells: unknown[],
  indexes: ColumnIndexes,
  description: string,
  sectionHeaders: boolean,
): RowKind {
  if (isBlankRow(cells)) return 'blank'
  // A total row has no unit; "Total station survey | 1 | lot" is a real line.
  if (TOTAL_ROW.test(description) && isBlankCell(cells[indexes.unit])) return 'total'
  // An amount with no quantity and no rate is a lump sum only with a lump-sum
  // unit; any other such row (VAT, a subtotal by another name) is not a line.
  const isAmountOnly =
    positiveAmount(cells, indexes) !== null &&
    isBlankCell(cells[indexes.quantity]) &&
    (indexes.unitRate < 0 || isBlankCell(cells[indexes.unitRate]))
  if (isAmountOnly && !LUMP_SUM_UNITS.has(normalizeUnit(cellText(cells[indexes.unit])))) return 'amountOnly'
  // A rate or a lump sum with no quantity is an item, not a header.
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

/**
 * The whole-centavo unit rate whose line total (the shared lineTotal, half-up)
 * is exactly the amount, or null when there is none. Integer arithmetic only.
 */
function exactUnitRate(amountCentavos: number, quantity: string): number | null {
  const [whole = '0', fraction = ''] = quantity.split('.')
  const scaledQuantity = BigInt(whole + fraction.padEnd(4, '0').slice(0, 4))
  if (scaledQuantity <= 0n) return null
  // round_half_up(amount / quantity), with quantity scaled by 10^4.
  const rate = (BigInt(amountCentavos) * 20_000n + scaledQuantity) / (2n * scaledQuantity)
  if (rate > BigInt(TAKEOFF_MAX_UNIT_RATE_CENTAVOS)) return null
  try {
    return lineTotal(Number(rate), quantity, 0) === amountCentavos ? Number(rate) : null
  } catch {
    return null
  }
}

interface RowPrice {
  quantity: CellNumber<string>
  /** Centavos; null: unreadable or not exact (Core queues it); undefined: the row has no price. */
  unitRateCentavos: number | null | undefined
}

/**
 * Prices a row from its mapped amount. With a rate the amount is only checked.
 * Without one the amount is the row's only price, so the rate is derived when
 * that is exact to the centavo, and a row with no quantity is a lump sum of
 * quantity 1 (classifyRow lets only a lump-sum unit through). Nothing is
 * rounded to make an amount fit.
 */
function priceFromAmount(cell: unknown, price: RowPrice, warn: Warn): RowPrice {
  const { quantity, unitRateCentavos } = price
  const amount = cellCentavos(cell, Number.MAX_SAFE_INTEGER)
  if (!amount.ok) {
    if (amount.problem !== 'BLANK') warn('UNREADABLE_AMOUNT', `Amount ${PROBLEM_TEXT[amount.problem]}.`)
    return price
  }
  const shown = `Amount PHP ${formatCentavos(amount.value)}`
  if (typeof unitRateCentavos === 'number') {
    if (!quantity.ok) return price
    let expected: number
    try {
      expected = lineTotal(unitRateCentavos, quantity.value, 0)
    } catch {
      return price // Out of range: validateTakeoffRows queues the rate in Core.
    }
    if (Math.abs(expected - amount.value) > 1) {
      warn(
        'AMOUNT_MISMATCH',
        `${shown} differs from quantity x unit rate PHP ${formatCentavos(expected)}; the system amount is used.`,
      )
    }
    return price
  }
  // An unreadable rate is already reported; a zero amount prices nothing.
  if (unitRateCentavos === null || amount.value === 0) return price

  if (!quantity.ok && quantity.problem === 'BLANK') {
    if (amount.value > TAKEOFF_MAX_UNIT_RATE_CENTAVOS) {
      warn('AMOUNT_IGNORED', `${shown} is over the supported rate range, so the line is imported without a price.`)
      return price
    }
    warn('LUMP_SUM', `No quantity: imported as a lump sum, quantity 1 at PHP ${formatCentavos(amount.value)}.`)
    return { quantity: { ok: true, value: '1' }, unitRateCentavos: amount.value }
  }
  if (!quantity.ok) {
    warn('AMOUNT_IGNORED', `${shown} is not imported because the quantity could not be read.`)
    return price
  }
  const derived = exactUnitRate(amount.value, quantity.value)
  if (derived === null) {
    warn(
      'AMOUNT_NOT_EXACT',
      `${shown} divided by quantity ${quantity.value} is not a whole-centavo unit rate, so no rate was derived and the line is left for review. Add a unit rate column or price the line after import.`,
    )
    return { quantity, unitRateCentavos: null }
  }
  return { quantity, unitRateCentavos: derived }
}

interface RowContext {
  headers: string[]
  indexes: ColumnIndexes
  warnings: TakeoffRowWarning[]
  /** Sheet rows hidden in the workbook. */
  hiddenRows: ReadonlySet<number>
}

function buildRow(
  cells: unknown[],
  rowNumber: number,
  section: string | null,
  { headers, indexes, warnings, hiddenRows }: RowContext,
): StructuredTakeoffRow {
  const text = (index: number) => (index >= 0 ? cellText(cells[index]).trim() : '')
  const sourceRowKey = text(indexes.sourceRowKey) || `row-${rowNumber}`
  const warn: Warn = (code, message) => warnings.push({ sourceRowKey, code, message })
  if (hiddenRows.has(rowNumber)) {
    warn('HIDDEN_ROW', 'This row is hidden in the sheet and was imported. Delete it from the file if it should not count.')
  }
  const read: RowPrice = {
    quantity: readQuantity(cells[indexes.quantity], warn),
    unitRateCentavos: indexes.unitRate >= 0 ? readRate(cells[indexes.unitRate], warn) : undefined,
  }
  const { quantity, unitRateCentavos } =
    indexes.amount >= 0 ? priceFromAmount(cells[indexes.amount], read, warn) : read
  const code = text(indexes.code).slice(0, 255)
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
    ...(code ? { code } : {}),
    notes: text(indexes.notes) || null,
    ...(unitRateCentavos === undefined ? {} : { unitRateCentavos }),
    raw: Object.fromEntries(headers.map((header, index) => [header, cellText(cells[index])])),
  }
}

function buildRows(
  grid: unknown[][],
  mapping: TakeoffColumnMapping,
  options: TakeoffParseOptions,
  hiddenRows: ReadonlySet<number> = new Set(),
  sheet: string | null = null,
): StructuredTakeoffResult {
  const headerRow = options.headerRow ?? detectHeaderRow(grid, mapping)
  const headers = (grid[headerRow - 1] ?? []).map((cell) => normalizeHeader(cellText(cell)))
  const indexes = columnIndexes(headers, mapping)
  const missingColumns = REQUIRED_FIELDS.filter(([field]) => indexes[field] < 0).map(([, label]) => label)
  if (missingColumns.length > 0) return { ...emptyResult(missingColumns, headerRow), headers }

  const result: StructuredTakeoffResult = { ...emptyResult([], headerRow), headers }
  const context: RowContext = { headers, indexes, warnings: result.warnings, hiddenRows }
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
    if (kind === 'blank' || kind === 'total' || kind === 'amountOnly') {
      result.skippedRows += 1
      const amount = positiveAmount(cells, indexes)
      if (amount !== null) {
        result.skippedAmountRows.push({
          sheet,
          row: rowNumber,
          label: (description || firstText(cells)).slice(0, 80),
          amount: formatCentavos(amount),
          reason: kind === 'total' ? TOTAL_ROW_REASON : AMOUNT_ONLY_REASON,
        })
      } else if (kind === 'total' && !isBlankCell(cells[indexes.quantity])) {
        // With a quantity it may be a line missing its unit.
        result.warnings.push({
          sourceRowKey: `row-${rowNumber}`,
          code: 'TOTAL_ROW_SKIPPED',
          message: `"${description.slice(0, 80)}" has a quantity but no unit; it was read as a total row and not imported.`,
        })
      }
    } else if (kind === 'section') {
      // A header merged from an earlier column has its text outside Description.
      section = description || firstText(cells) || null
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
    const { sheets, sheet, grid, hiddenRows } = await readWorksheet(buffer, options)
    if (sheet === null) {
      return { ...emptyResult(['worksheet']), workbook: { sheets, sheet: options.sheet ?? '' } }
    }
    return {
      ...buildRows(grid, mapping, options, new Set(hiddenRows), sheet),
      workbook: { sheets, sheet },
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
