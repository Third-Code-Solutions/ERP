import { createRequire } from 'node:module'
import * as ExcelJS from 'exceljs'
import {
  computeBomTotals,
  computeDupa,
  lineTotal,
  topLevelBomLines,
  type DupaInput,
} from '@third-code-erp/shared-types/bom'
import { groupBomLinesByDivision } from '@/lib/operations/bom-hierarchy'
import { toManilaDateTimeLocal } from '@/lib/operations/cadence-engine'
import { centavosDecimal, excelText, looksLikeFormula } from './cells'

const require = createRequire(import.meta.url)

export interface BoqExportLine {
  id: string
  item_no: string | null
  code: string | null
  description: string
  division_id: string | null
  division: string | null
  location: string | null
  unit: string | null
  // D-5: numeric(18,4) decimal string.
  quantity: string
  unit_cost_cents: number
  line_total_cents: number
  markup_bps: number
  unit_rate_source: string
  notes: string | null
  is_group: number
  parent_line_item_id: string | null
}

export interface BoqExportDupa {
  bom_line_item_id: string
  header_quantity: string
  uom: string
  ocm_bps: number
  profit_bps: number
  vat_bps: number
  direct_cost_centavos: bigint
  indirect_cost_centavos: bigint
  vat_centavos: bigint
  total_cost_centavos: bigint
  unit_rate_centavos: bigint
  materials: Array<{ description: string; quantity: string; uom: string; unit_rate_centavos: bigint }>
  labour: Array<{
    description: string
    no_of_persons: string
    hourly_rate_centavos: bigint
    productivity_per_hour: string
  }>
  equipment: Array<{
    description: string
    no_of_units: string
    hourly_rate_centavos: bigint
    productivity_per_hour: string
  }>
}

export interface BoqExportData {
  project: { name: string; code: string | null; client: string | null }
  bom: {
    version: number
    status: string
    label: string | null
    total_cost_cents: number
    tcv_cents: number
    gp_cents: number
    gp_margin_bps: number
  }
  lines: BoqExportLine[]
  dupas: BoqExportDupa[]
}

// One workbook carries at most this many BOM lines; it also keeps the id lists
// the loader binds well under the 65,535 parameters a statement can take.
export const BOQ_EXPORT_MAX_LINES = 20_000

/** A BOM with more lines than one export carries; the message is safe to show. */
export class BoqExportTooLargeError extends Error {
  constructor() {
    super(
      `This BOM has more than ${BOQ_EXPORT_MAX_LINES.toLocaleString('en-PH')} lines and cannot be exported to one workbook.`,
    )
  }
}

export const BOQ_EXPORT_HEADERS = [
  'Item No',
  'Code',
  'Description',
  'Division',
  'Location',
  'Unit',
  'Quantity',
  'Unit Rate (PHP)',
  'Amount (PHP)',
  'Markup %',
  'Line Total (PHP)',
  'Rate Source',
  'Notes',
] as const

// 1-based columns the totals sit under: cost under Amount, contract value under Line Total.
const AMOUNT_COLUMN = BOQ_EXPORT_HEADERS.indexOf('Amount (PHP)') + 1
const LINE_TOTAL_COLUMN = BOQ_EXPORT_HEADERS.indexOf('Line Total (PHP)') + 1
const COLUMN_WIDTHS = [10, 12, 48, 20, 18, 8, 14, 16, 18, 10, 18, 12, 32]
const QUANTITY_FORMAT = '#,##0.0000'
const MONEY_FORMAT = '#,##0.00'
const RATE_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  dupa: 'DUPA',
  client_boq: 'Client BOQ',
}

type Cell = string | { quantity: string } | { centavos: number | bigint } | { fraction: number } | null

const DUPA_ROUNDING_NOTE = 'Lines are shown rounded; the subtotal is computed before rounding.'

/** BOQ-<project code or name>-v<version>-<yyyymmdd>.xlsx, filesystem safe. */
export function boqExportFileName(data: BoqExportData, exportedAt: Date): string {
  const yyyymmdd = toManilaDateTimeLocal(exportedAt).slice(0, 10).replaceAll('-', '')
  const project =
    (data.project.code?.trim() || data.project.name)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 60) || 'project'
  return `BOQ-${project}-v${data.bom.version}-${yyyymmdd}.xlsx`
}

/** Basis points -> fraction for a percent-formatted cell (2273 -> 0.2273). */
function bpsFraction(bps: number): number {
  const absolute = Math.abs(bps)
  const fraction = String(absolute % 10_000).padStart(4, '0')
  return Number(`${bps < 0 ? '-' : ''}${Math.trunc(absolute / 10_000)}.${fraction}`)
}

/** Every value is typed: text stays text (never a formula), numbers carry a format. */
function writeRow(sheet: ExcelJS.Worksheet, values: Cell[], bold = false): ExcelJS.Row {
  const row = sheet.addRow([])
  values.forEach((value, index) => {
    if (value === null) return
    const cell = row.getCell(index + 1)
    if (typeof value === 'string') {
      const text = excelText(value)
      cell.value = text
      // Marker style that writeBoqWorkbook turns into quotePrefix (ExcelJS
      // cannot write it), so editing the cell keeps it text.
      if (looksLikeFormula(text)) cell.protection = { locked: true }
    } else if ('quantity' in value) {
      cell.value = Number(value.quantity)
      cell.numFmt = QUANTITY_FORMAT
    } else if ('centavos' in value) {
      cell.value = Number(centavosDecimal(value.centavos))
      cell.numFmt = MONEY_FORMAT
    } else {
      cell.value = value.fraction
      cell.numFmt = '0.00%'
    }
  })
  if (bold) row.font = { bold: true }
  return row
}

/** The lines the BOQ lists: those the BOM totals count, in BOM page order. */
export function boqExportLines(lines: ReadonlyArray<BoqExportLine>): BoqExportLine[] {
  const commercial = topLevelBomLines(lines, (line) => line.parent_line_item_id)
  return groupBomLinesByDivision(
    commercial.map((line) => ({ ...line, division_label: line.division })),
  ).flatMap((group) => group.lines)
}

/** Amount = round_half_up(quantity x unit rate): the figure total_cost_cents adds up. */
export function boqLineAmountCents(line: Pick<BoqExportLine, 'unit_cost_cents' | 'quantity'>): number {
  return lineTotal(line.unit_cost_cents, line.quantity, 0)
}

function addBoqSheet(workbook: ExcelJS.Workbook, data: BoqExportData, exportedAt: Date) {
  const sheet = workbook.addWorksheet('BOQ')
  const [date, time] = toManilaDateTimeLocal(exportedAt).split('T')
  writeRow(sheet, ['Bill of Quantities'], true).font = { bold: true, size: 14 }
  const projectName = data.project.code
    ? `${data.project.name} (${data.project.code})`
    : data.project.name
  writeRow(sheet, ['Project', projectName])
  writeRow(sheet, ['Client', data.project.client ?? ''])
  writeRow(sheet, [
    'BOM',
    `v${data.bom.version} · ${data.bom.status}${data.bom.label ? ` · ${data.bom.label}` : ''}`,
  ])
  writeRow(sheet, ['Exported', `${date} ${time} (Asia/Manila)`])
  writeRow(sheet, ['Currency', 'PHP'])
  sheet.addRow([])

  const header = writeRow(sheet, [...BOQ_EXPORT_HEADERS], true)
  header.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin' } }
  })
  sheet.views = [{ state: 'frozen', ySplit: header.number }]
  COLUMN_WIDTHS.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })

  for (const line of boqExportLines(data.lines)) {
    const amount = boqLineAmountCents(line)
    const isGroup = line.is_group !== 0
    // A section row shows numbers only when it carries cost the totals count.
    const priced = !isGroup || amount !== 0 || line.line_total_cents !== 0
    const row = writeRow(
      sheet,
      [
        line.item_no ?? '',
        line.code ?? '',
        line.description,
        line.division ?? '',
        line.location ?? '',
        priced ? (line.unit ?? '') : '',
        priced ? { quantity: line.quantity } : null,
        priced ? { centavos: line.unit_cost_cents } : null,
        priced ? { centavos: amount } : null,
        priced ? { fraction: bpsFraction(line.markup_bps) } : null,
        priced ? { centavos: line.line_total_cents } : null,
        priced ? (RATE_SOURCE_LABELS[line.unit_rate_source] ?? line.unit_rate_source) : '',
        line.notes ?? '',
      ],
      isGroup,
    )
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' }
  }

  sheet.addRow([])
  // Computed from the lines printed above with the formula of the stored BOM
  // totals, so the workbook always adds up. A stored total that has fallen
  // behind its lines is printed beside the computed one, not instead of it.
  // Labels start with "Total" so a re-import skips these rows.
  const computed = computeBomTotals(data.lines)
  type Total = [label: string, column: number, value: Cell]
  const stale = (label: string, column: number, stored: number, current: number): Total[] =>
    stored === current ? [] : [[`${label} stored on the BOM (out of date)`, column, { centavos: stored }]]
  // Each total sits under the column that adds up to it: the Amount column
  // (cost, no markup) to Total cost, the Line Total column to TCV.
  const totals: Total[] = [
    ['Total cost', AMOUNT_COLUMN, { centavos: computed.total_cost_cents }],
    ['Total contract value (TCV)', LINE_TOTAL_COLUMN, { centavos: computed.tcv_cents }],
    ['Total gross profit (GP)', LINE_TOTAL_COLUMN, { centavos: computed.gp_cents }],
    ['Total GP margin', LINE_TOTAL_COLUMN, { fraction: bpsFraction(computed.gp_margin_bps) }],
    ...stale('Total cost', AMOUNT_COLUMN, data.bom.total_cost_cents, computed.total_cost_cents),
    ...stale('Total contract value (TCV)', LINE_TOTAL_COLUMN, data.bom.tcv_cents, computed.tcv_cents),
  ]
  for (const [label, column, value] of totals) {
    const cells: Cell[] = Array.from({ length: column }, () => null)
    cells[2] = label
    cells[column - 1] = value
    writeRow(sheet, cells, true)
  }
}

// Basis points have the same scale as centavos: 1250 bps -> "12.50%".
function percent(bps: number): string {
  return `${centavosDecimal(bps)}%`
}

interface DupaPart {
  heading: Cell[]
  lines: Cell[][]
  subtotalLabel: string
  subtotal: bigint
}

/** DUPA parts A-C: each line rounded on its own, subtotals exact (computeDupa). */
function dupaParts(dupa: BoqExportDupa): DupaPart[] {
  const materials = dupa.materials.map((m) => ({ quantity: m.quantity, unitRateCentavos: m.unit_rate_centavos }))
  const labour = dupa.labour.map((l) => ({
    noOfPersons: l.no_of_persons,
    hourlyRateCentavos: l.hourly_rate_centavos,
    productivityPerHour: l.productivity_per_hour,
  }))
  const equipment = dupa.equipment.map((e) => ({
    noOfUnits: e.no_of_units,
    hourlyRateCentavos: e.hourly_rate_centavos,
    productivityPerHour: e.productivity_per_hour,
  }))
  const subtotals = computeDupa({ headerQuantity: '1', materials, labour, equipment })
  // A single line's only non-zero subtotal is that line's amount.
  const amount = (input: Omit<DupaInput, 'headerQuantity'>): Cell => {
    const one = computeDupa({ headerQuantity: '1', ...input })
    return { centavos: one.materialSubtotalCentavos + one.labourSubtotalCentavos + one.equipmentSubtotalCentavos }
  }
  const crewHeading = (title: string, count: string): Cell[] =>
    [title, count, 'Hourly Rate (PHP)', 'Output / hour', 'Amount (PHP)']

  return [
    {
      heading: ['A. Materials', 'Quantity', 'UOM', 'Unit Rate (PHP)', 'Amount (PHP)'],
      lines: dupa.materials.map((m, index) => [
        m.description,
        { quantity: m.quantity },
        m.uom,
        { centavos: m.unit_rate_centavos },
        amount({ materials: [materials[index]!] }),
      ]),
      subtotalLabel: 'Subtotal A',
      subtotal: subtotals.materialSubtotalCentavos,
    },
    {
      heading: crewHeading('B. Labour', 'Persons'),
      lines: dupa.labour.map((l, index) => [
        l.description,
        { quantity: l.no_of_persons },
        { centavos: l.hourly_rate_centavos },
        { quantity: l.productivity_per_hour },
        amount({ labour: [labour[index]!] }),
      ]),
      subtotalLabel: 'Subtotal B',
      subtotal: subtotals.labourSubtotalCentavos,
    },
    {
      heading: crewHeading('C. Equipment', 'Units'),
      lines: dupa.equipment.map((e, index) => [
        e.description,
        { quantity: e.no_of_units },
        { centavos: e.hourly_rate_centavos },
        { quantity: e.productivity_per_hour },
        amount({ equipment: [equipment[index]!] }),
      ]),
      subtotalLabel: 'Subtotal C',
      subtotal: subtotals.equipmentSubtotalCentavos,
    },
  ]
}

function addDupaSheet(workbook: ExcelJS.Workbook, lines: BoqExportLine[], dupas: BoqExportDupa[]) {
  const dupaByLine = new Map(dupas.map((dupa) => [dupa.bom_line_item_id, dupa]))
  const priced = lines.filter((line) => dupaByLine.has(line.id))
  if (priced.length === 0) return

  const sheet = workbook.addWorksheet('DUPA')
  ;[48, 14, 18, 18, 18].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
  for (const line of priced) {
    const dupa = dupaByLine.get(line.id)!
    writeRow(sheet, [`${line.item_no ? `${line.item_no} ` : ''}${line.description}`], true)
    writeRow(sheet, ['Output quantity', { quantity: dupa.header_quantity }, dupa.uom])

    for (const part of dupaParts(dupa)) {
      writeRow(sheet, part.heading, true)
      for (const cells of part.lines) writeRow(sheet, cells)
      writeRow(sheet, [part.subtotalLabel, null, null, null, { centavos: part.subtotal }], true)
      writeRow(sheet, [DUPA_ROUNDING_NOTE]).font = { italic: true }
    }

    const stored: Array<[string, bigint]> = [
      ['D. Direct cost (A + B + C)', dupa.direct_cost_centavos],
      [`E. Indirect cost (OCM ${percent(dupa.ocm_bps)} + profit ${percent(dupa.profit_bps)})`, dupa.indirect_cost_centavos],
      [`F. VAT ${percent(dupa.vat_bps)}`, dupa.vat_centavos],
      ['G. Total cost', dupa.total_cost_centavos],
      [`H. Unit rate per ${dupa.uom} (G / output quantity)`, dupa.unit_rate_centavos],
    ]
    for (const [label, centavos] of stored) {
      writeRow(sheet, [label, null, null, null, { centavos }], true)
    }
    sheet.addRow([])
  }
}

export function buildBoqWorkbook(data: BoqExportData, exportedAt: Date): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ABI OPS'
  workbook.created = exportedAt
  addBoqSheet(workbook, data, exportedAt)
  addDupaSheet(workbook, boqExportLines(data.lines), data.dupas)
  return workbook
}

/**
 * The .xlsx bytes. ExcelJS 4 has no quotePrefix, so the marker style from
 * writeRow (the only cells with applyProtection) gets it in styles.xml.
 */
export async function writeBoqWorkbook(data: BoqExportData, exportedAt: Date): Promise<Buffer> {
  const written = Buffer.from(await buildBoqWorkbook(data, exportedAt).xlsx.writeBuffer())
  // SheetJS through CommonJS, as document-intake loads it; only its zip codec is used.
  const { CFB } = require('xlsx') as typeof import('xlsx')
  const zip = CFB.read(written, { type: 'buffer' })
  const styles = CFB.find(zip, '/xl/styles.xml')
  if (!styles) throw new Error('BOQ workbook has no styles part')
  const xml = Buffer.from(styles.content).toString('utf8')
  styles.content = Buffer.from(
    xml.replaceAll(' applyProtection="1"', ' applyProtection="1" quotePrefix="1"'),
  )
  return Buffer.from(CFB.write(zip, { fileType: 'zip', type: 'buffer', compression: true }))
}
