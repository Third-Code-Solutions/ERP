import { createHash } from 'node:crypto'
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
  cellQuantity,
  cellText,
  formatCentavos,
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
  /** Rows with no quantity and no unit become the division below. Default on. */
  sectionHeaders?: boolean
}

export type TakeoffRowWarningCode =
  | 'AMOUNT_MISMATCH'
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

export const TAKEOFF_MAX_HEADER_ROW = 50

type MappedField = Exclude<keyof TakeoffColumnMapping, 'sourceRowKey'>

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
      current = ''
      continue
    }
    current += character
  }
  cells.push(current.trim())
  return cells
}

/** Sheet as dense rows of raw values; merged-range followers read as blank. */
function worksheetGrid(worksheet: ExcelJS.Worksheet): unknown[][] {
  const grid: unknown[][] = []
  worksheet.eachRow((row, rowNumber) => {
    const cells: unknown[] = []
    row.eachCell((cell, column) => {
      cells[column - 1] = cell.isMerged && cell.master.address !== cell.address ? null : cell.value
    })
    grid[rowNumber - 1] = Array.from(cells)
  })
  return Array.from(grid, (cells) => cells ?? [])
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

function buildRows(
  grid: unknown[][],
  mapping: TakeoffColumnMapping,
  options: TakeoffParseOptions,
): StructuredTakeoffResult {
  const headerRow = options.headerRow ?? detectHeaderRow(grid, mapping)
  const headers = (grid[headerRow - 1] ?? []).map((cell) => normalizeHeader(cellText(cell)))
  const column = (field: MappedField) => findColumn(headers, field, mapping[field])

  const missingColumns = REQUIRED_FIELDS.filter(([field]) => column(field) < 0).map(
    ([, label]) => label,
  )
  if (missingColumns.length > 0) return { ...emptyResult(missingColumns, headerRow), headers }

  const indexes = {
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
  const sectionHeaders = options.sectionHeaders ?? true

  let lastRow = grid.length
  while (lastRow > headerRow && isBlankRow(grid[lastRow - 1] ?? [])) lastRow -= 1

  const rows: StructuredTakeoffRow[] = []
  const warnings: TakeoffRowWarning[] = []
  let skippedRows = 0
  let sectionRows = 0
  let section: string | null = null

  // One row past the limit is enough for the caller to reject the file.
  for (
    let rowNumber = headerRow + 1;
    rowNumber <= lastRow && rows.length <= TAKEOFF_IMPORT_MAX_ROWS;
    rowNumber += 1
  ) {
    const cells = grid[rowNumber - 1] ?? []
    const text = (index: number) => (index >= 0 ? cellText(cells[index]).trim() : '')
    const description = text(indexes.description)
    if (isBlankRow(cells) || TOTAL_ROW.test(description)) {
      skippedRows += 1
      continue
    }

    const quantityCell = cellQuantity(cells[indexes.quantity])
    const unit = normalizeUnit(text(indexes.unit))
    const quantityBlank = !quantityCell.ok && quantityCell.problem === 'BLANK'
    if (sectionHeaders && quantityBlank && !unit) {
      // A header merged from an earlier column has its text outside Description.
      section = description || cells.map((cell) => cellText(cell).trim()).find(Boolean) || null
      sectionRows += 1
      continue
    }

    const sourceRowKey = text(indexes.sourceRowKey) || `row-${rowNumber}`
    const warn = (code: TakeoffRowWarningCode, message: string) =>
      warnings.push({ sourceRowKey, code, message })
    if (!quantityCell.ok && !quantityBlank) {
      warn('UNREADABLE_QUANTITY', `Quantity ${PROBLEM_TEXT[quantityCell.problem]}.`)
    }

    let unitRateCentavos: number | null | undefined
    if (indexes.unitRate >= 0) {
      const rate = cellCentavos(cells[indexes.unitRate], TAKEOFF_MAX_UNIT_RATE_CENTAVOS)
      if (rate.ok) unitRateCentavos = rate.value
      else if (rate.problem !== 'BLANK') {
        unitRateCentavos = null
        warn('UNREADABLE_UNIT_RATE', `Unit rate ${PROBLEM_TEXT[rate.problem]}.`)
      }
    }

    if (indexes.amount >= 0) {
      const amount = cellCentavos(cells[indexes.amount], Number.MAX_SAFE_INTEGER)
      if (!amount.ok && amount.problem !== 'BLANK') {
        warn('UNREADABLE_AMOUNT', `Amount ${PROBLEM_TEXT[amount.problem]}.`)
      } else if (amount.ok && quantityCell.ok && typeof unitRateCentavos === 'number') {
        let expected: number | null = null
        try {
          expected = lineTotal(unitRateCentavos, quantityCell.value, 0)
        } catch {
          // Out of range: validateTakeoffRows queues the rate in Core.
        }
        if (expected !== null && Math.abs(expected - amount.value) > 1) {
          warn(
            'AMOUNT_MISMATCH',
            `Amount PHP ${formatCentavos(amount.value)} differs from quantity x unit rate PHP ${formatCentavos(expected)}; the system amount is used.`,
          )
        }
      }
    }

    rows.push({
      sourceRowKey,
      description,
      quantity: quantityCell.ok ? Number(quantityCell.value) : null,
      unit,
      division: text(indexes.division) || section,
      location: text(indexes.location) || null,
      itemNo: text(indexes.itemNo) || null,
      notes: text(indexes.notes) || null,
      ...(unitRateCentavos === undefined ? {} : { unitRateCentavos }),
      raw: Object.fromEntries(headers.map((header, index) => [header, cellText(cells[index])])),
    })
  }

  return { rows, missingColumns: [], headers, headerRow, skippedRows, sectionRows, warnings }
}

export async function parseStructuredTakeoff(
  buffer: Buffer,
  fileName: string,
  mapping: TakeoffColumnMapping,
  options: TakeoffParseOptions = {},
): Promise<StructuredTakeoffResult> {
  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith('.csv')) {
    const lines = buffer.toString('utf8').split(/\r?\n/)
    if (lines.every((line) => line.trim().length === 0)) return emptyResult(['file'])
    return buildRows(lines.map(splitCsvLine), mapping, options)
  }

  if (lowerName.endsWith('.xlsx')) {
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
      ...buildRows(worksheetGrid(worksheet), mapping, options),
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
