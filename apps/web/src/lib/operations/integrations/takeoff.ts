import { createHash } from 'node:crypto'
import * as ExcelJS from 'exceljs'

export interface TakeoffColumnMapping {
  sourceRowKey?: string
  description: string
  quantity: string
  unit: string
  division?: string
  location?: string
  itemNo?: string
  notes?: string
}

export interface StructuredTakeoffRow {
  sourceRowKey: string
  description: string
  quantity: number | null
  unit: string
  division: string | null
  location: string | null
  itemNo: string | null
  notes: string | null
  raw: Record<string, string>
}

export interface StructuredTakeoffResult {
  rows: StructuredTakeoffRow[]
  missingColumns: string[]
  headers: string[]
}

export type TakeoffValidationCode =
  | 'DUPLICATE_SOURCE_ROW_KEY'
  | 'EMPTY_DESCRIPTION'
  | 'INVALID_QUANTITY'
  | 'INVALID_UOM'
  | 'MISSING_DIVISION'
  | 'NO_CATALOG_MATCH'
  | 'MATERIAL_PARENT_REQUIRED'

export interface TakeoffValidationIssue {
  sourceRowKey: string
  code: TakeoffValidationCode
  message: string
}

const REQUIRED_MAPPING_FIELDS = [
  ['description', 'Description'],
  ['quantity', 'Quantity'],
  ['unit', 'UOM'],
] as const

const RECOGNIZED_UOMS = new Set([
  'sqm',
  'm2',
  'sq.m',
  'm²',
  'cu.m',
  'm3',
  'm³',
  'lm',
  'lot',
  'pc',
  'pcs',
  'kg',
  'liter',
  'liters',
  'l',
  'set',
])

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function findColumn(headers: string[], configured: string | undefined): number {
  if (!configured) return -1
  return headers.indexOf(normalizeHeader(configured))
}

function cellToString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text
  }
  return String(value)
}

function parseQuantity(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '')
  if (!normalized) return null
  const quantity = Number(normalized)
  return Number.isFinite(quantity) ? quantity : null
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

function buildRows(
  headers: string[],
  values: string[][],
  mapping: TakeoffColumnMapping,
): StructuredTakeoffResult {
  const missingColumns = REQUIRED_MAPPING_FIELDS.filter(([, label]) => {
    const configured = mapping[
      label === 'Description'
        ? 'description'
        : label === 'Quantity'
          ? 'quantity'
          : 'unit'
    ]
    return findColumn(headers, configured) < 0
  }).map(([, label]) => label)

  if (missingColumns.length > 0) {
    return { rows: [], missingColumns, headers }
  }

  const indexes = {
    sourceRowKey: findColumn(headers, mapping.sourceRowKey),
    description: findColumn(headers, mapping.description),
    quantity: findColumn(headers, mapping.quantity),
    unit: findColumn(headers, mapping.unit),
    division: findColumn(headers, mapping.division),
    location: findColumn(headers, mapping.location),
    itemNo: findColumn(headers, mapping.itemNo),
    notes: findColumn(headers, mapping.notes),
  }

  const rows = values
    .map((cells, index) => {
      const raw = Object.fromEntries(
        headers.map((header, headerIndex) => [header, cells[headerIndex] ?? '']),
      )
      const sourceRowKey =
        (indexes.sourceRowKey >= 0 ? cells[indexes.sourceRowKey] : '')?.trim() ||
        `row-${index + 2}`

      return {
        sourceRowKey,
        description: (cells[indexes.description] ?? '').trim(),
        quantity: parseQuantity(cells[indexes.quantity] ?? ''),
        unit: normalizeUnit(cells[indexes.unit] ?? ''),
        division:
          indexes.division >= 0
            ? (cells[indexes.division] ?? '').trim() || null
            : null,
        location:
          indexes.location >= 0
            ? (cells[indexes.location] ?? '').trim() || null
            : null,
        itemNo:
          indexes.itemNo >= 0
            ? (cells[indexes.itemNo] ?? '').trim() || null
            : null,
        notes:
          indexes.notes >= 0
            ? (cells[indexes.notes] ?? '').trim() || null
            : null,
        raw,
      }
    })
    .filter((row) => Object.values(row.raw).some((value) => value.length > 0))

  return { rows, missingColumns: [], headers }
}

export async function parseStructuredTakeoff(
  buffer: Buffer,
  fileName: string,
  mapping: TakeoffColumnMapping,
): Promise<StructuredTakeoffResult> {
  const lowerName = fileName.toLowerCase()
  if (lowerName.endsWith('.csv')) {
    const lines = buffer
      .toString('utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
    if (lines.length === 0) return { rows: [], missingColumns: ['file'], headers: [] }
    const headers = splitCsvLine(lines[0]!).map(normalizeHeader)
    return buildRows(
      headers,
      lines.slice(1).map(splitCsvLine),
      mapping,
    )
  }

  if (lowerName.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook()
    // ExcelJS' runtime accepts Node Buffers, while its declaration is typed
    // as an ArrayBuffer in this version of the package.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
    const worksheet = workbook.worksheets[0]
    if (!worksheet) return { rows: [], missingColumns: ['worksheet'], headers: [] }

    const headerCells: string[] = []
    worksheet.getRow(1).eachCell((cell, column) => {
      headerCells[column - 1] = normalizeHeader(cellToString(cell.value))
    })

    const values: string[][] = []
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber)
      const cells = headerCells.map((_, column) => cellToString(row.getCell(column + 1).value))
      if (cells.some((cell) => cell.trim().length > 0)) values.push(cells)
    }
    return buildRows(headerCells, values, mapping)
  }

  throw new Error(`Unsupported takeoff format: ${fileName}`)
}

export function validateTakeoffRows(
  rows: StructuredTakeoffRow[],
): TakeoffValidationIssue[] {
  const issues: TakeoffValidationIssue[] = []
  const seenKeys = new Set<string>()

  for (const row of rows) {
    if (seenKeys.has(row.sourceRowKey)) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'DUPLICATE_SOURCE_ROW_KEY',
        message: 'Source row key is duplicated in this import.',
      })
    } else {
      seenKeys.add(row.sourceRowKey)
    }

    if (!row.description) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'EMPTY_DESCRIPTION',
        message: 'Description is required.',
      })
    }
    if (row.quantity == null || row.quantity <= 0) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'INVALID_QUANTITY',
        message: 'Quantity must be greater than zero.',
      })
    }

    const unit = normalizeUnit(row.unit)
    if (!RECOGNIZED_UOMS.has(unit)) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'INVALID_UOM',
        message: `UOM "${row.unit}" is not recognized.`,
      })
    }
    if (!row.division) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'MISSING_DIVISION',
        message: 'Division is required before import.',
      })
    }
  }

  return issues
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
