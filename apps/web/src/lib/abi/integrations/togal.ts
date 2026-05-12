/**
 * Togal.ai takeoff parser (REFACTOR.md §7.1).
 *
 * Spec: CSV/XLSX with columns "Element Type"/"Category", "Quantity", "Unit"
 * plus optional "Level"/"Floor", "Room"/"Zone", "Notes".
 *
 * Parses in TypeScript (no Python required) using xlsx-like CSV split for
 * simple files. For XLSX we delegate to ExcelJS (already a dependency).
 *
 * Returns a normalized + mapping-applied result the BOM auto-gen can chew
 * directly. Unmapped items surface in `unmapped` for the import wizard
 * to flag in red per US-010 #7.
 */

import * as ExcelJS from 'exceljs'

export interface TogalRow {
  element_type: string
  quantity: number
  unit: string
  level?: string
  room?: string
  notes?: string
}

export interface TogalParseResult {
  rows: TogalRow[]
  row_count: number
  unmapped: string[] // raw element_type strings not present in mapping_config
  missing_columns: string[]
}

const REQUIRED_COLUMNS = [
  ['element type', 'category'],
  ['quantity'],
  ['unit'],
]

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function parseTogalFile(
  buffer: Buffer,
  fileName: string
): Promise<TogalParseResult> {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.csv')) return parseCsv(buffer.toString('utf-8'))
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return parseXlsx(buffer)
  throw new Error(`Unsupported Togal export format: ${fileName}`)
}

function parseCsv(content: string): TogalParseResult {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return emptyResult(['file is empty'])
  const headers = lines[0]!.split(',').map((h) => normalizeHeader(h.replace(/^"|"$/g, '')))
  const rows: string[][] = lines.slice(1).map((line) => splitCsvLine(line))
  return assembleResult(headers, rows)
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes
    else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

async function parseXlsx(buffer: Buffer): Promise<TogalParseResult> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS types want a strict ArrayBuffer view; widen with a cast.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return emptyResult(['no worksheet'])
  const headerRow = ws.getRow(1)
  const headers: string[] = []
  headerRow.eachCell((cell, col) => {
    headers[col - 1] = normalizeHeader(String(cell.value ?? ''))
  })
  const rows: string[][] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const cells: string[] = []
    headers.forEach((_h, i) => {
      const v = row.getCell(i + 1).value
      cells[i] = v == null ? '' : String(v)
    })
    if (cells.some((c) => c && c.length > 0)) rows.push(cells)
  }
  return assembleResult(headers, rows)
}

function assembleResult(headers: string[], rows: string[][]): TogalParseResult {
  const missing = REQUIRED_COLUMNS.filter(
    (aliases) => !aliases.some((a) => headers.includes(a))
  ).map((a) => a[0]!)
  if (missing.length > 0) return emptyResult(missing)

  const idx = {
    elementType:
      headers.indexOf('element type') >= 0
        ? headers.indexOf('element type')
        : headers.indexOf('category'),
    quantity: headers.indexOf('quantity'),
    unit: headers.indexOf('unit'),
    level:
      headers.indexOf('level') >= 0 ? headers.indexOf('level') : headers.indexOf('floor'),
    room: headers.indexOf('room') >= 0 ? headers.indexOf('room') : headers.indexOf('zone'),
    notes: headers.indexOf('notes'),
  }

  const out: TogalRow[] = []
  for (const r of rows) {
    const qtyRaw = r[idx.quantity] ?? ''
    const qty = Number(qtyRaw.replace(/,/g, ''))
    if (!Number.isFinite(qty) || qty <= 0) continue
    out.push({
      element_type: (r[idx.elementType] ?? '').trim(),
      quantity: qty,
      unit: (r[idx.unit] ?? '').trim(),
      level: idx.level >= 0 ? (r[idx.level] ?? '').trim() || undefined : undefined,
      room: idx.room >= 0 ? (r[idx.room] ?? '').trim() || undefined : undefined,
      notes: idx.notes >= 0 ? (r[idx.notes] ?? '').trim() || undefined : undefined,
    })
  }

  return {
    rows: out,
    row_count: out.length,
    unmapped: [], // caller fills this after looking up `mapping_config`
    missing_columns: [],
  }
}

function emptyResult(missing: string[]): TogalParseResult {
  return { rows: [], row_count: 0, unmapped: [], missing_columns: missing }
}
