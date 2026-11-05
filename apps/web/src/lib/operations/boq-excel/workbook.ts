import * as ExcelJS from 'exceljs'
import {
  computeDupa,
  lineTotal,
  topLevelBomLines,
  type DupaInput,
} from '@third-code-erp/shared-types/bom'
import { groupBomLinesByDivision } from '@/lib/operations/bom-hierarchy'
import { centavosDecimal, excelText } from './cells'

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
  'Rate Source',
  'Notes',
] as const

const COLUMN_WIDTHS = [10, 12, 48, 20, 18, 8, 14, 16, 18, 12, 32]
const QUANTITY_FORMAT = '#,##0.0000'
const MONEY_FORMAT = '#,##0.00'
const RATE_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  dupa: 'DUPA',
  client_boq: 'Client BOQ',
}

type Cell = string | { quantity: string } | { centavos: number | bigint } | { fraction: number } | null

function manilaParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
}

/** BOQ-<project code or name>-v<version>-<yyyymmdd>.xlsx, filesystem safe. */
export function boqExportFileName(data: BoqExportData, exportedAt: Date): string {
  const { year, month, day } = manilaParts(exportedAt)
  const project =
    (data.project.code?.trim() || data.project.name)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 60) || 'project'
  return `BOQ-${project}-v${data.bom.version}-${year}${month}${day}.xlsx`
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
      cell.value = excelText(value)
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

/** The lines the BOQ lists: those the stored totals count, in BOM page order. */
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
  const { year, month, day, hour, minute } = manilaParts(exportedAt)
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
  writeRow(sheet, ['Exported', `${year}-${month}-${day} ${hour}:${minute} (Asia/Manila)`])
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
    const priced = !isGroup || amount !== 0
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
        priced ? (RATE_SOURCE_LABELS[line.unit_rate_source] ?? line.unit_rate_source) : '',
        line.notes ?? '',
      ],
      isGroup,
    )
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' }
  }

  sheet.addRow([])
  // Labels start with "Total" so a re-import skips these rows.
  const totals: Array<[string, Cell]> = [
    ['Total cost', { centavos: data.bom.total_cost_cents }],
    ['Total contract value (TCV)', { centavos: data.bom.tcv_cents }],
    ['Total gross profit (GP)', { centavos: data.bom.gp_cents }],
    ['Total GP margin', { fraction: bpsFraction(data.bom.gp_margin_bps) }],
  ]
  for (const [label, value] of totals) {
    writeRow(sheet, [null, null, label, null, null, null, null, null, value], true)
  }
}

function dupaAmount(
  input: Omit<DupaInput, 'headerQuantity'>,
  part: 'material' | 'labour' | 'equipment',
) {
  const result = computeDupa({ headerQuantity: '1', ...input })
  if (part === 'material') return result.materialSubtotalCentavos
  return part === 'labour' ? result.labourSubtotalCentavos : result.equipmentSubtotalCentavos
}

// Basis points have the same scale as centavos: 1250 bps -> "12.50%".
function percent(bps: number): string {
  return `${centavosDecimal(bps)}%`
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

    writeRow(sheet, [`${line.item_no ? `${line.item_no} ` : ''}${line.description}`], true)
    writeRow(sheet, ['Output quantity', { quantity: dupa.header_quantity }, dupa.uom])

    writeRow(sheet, ['A. Materials', 'Quantity', 'UOM', 'Unit Rate (PHP)', 'Amount (PHP)'], true)
    dupa.materials.forEach((m, index) => {
      writeRow(sheet, [
        m.description,
        { quantity: m.quantity },
        m.uom,
        { centavos: m.unit_rate_centavos },
        { centavos: dupaAmount({ materials: [materials[index]!] }, 'material') },
      ])
    })
    writeRow(sheet, ['Subtotal A', null, null, null, { centavos: subtotals.materialSubtotalCentavos }], true)

    writeRow(sheet, ['B. Labour', 'Persons', 'Hourly Rate (PHP)', 'Output / hour', 'Amount (PHP)'], true)
    dupa.labour.forEach((l, index) => {
      writeRow(sheet, [
        l.description,
        { quantity: l.no_of_persons },
        { centavos: l.hourly_rate_centavos },
        { quantity: l.productivity_per_hour },
        { centavos: dupaAmount({ labour: [labour[index]!] }, 'labour') },
      ])
    })
    writeRow(sheet, ['Subtotal B', null, null, null, { centavos: subtotals.labourSubtotalCentavos }], true)

    writeRow(sheet, ['C. Equipment', 'Units', 'Hourly Rate (PHP)', 'Output / hour', 'Amount (PHP)'], true)
    dupa.equipment.forEach((e, index) => {
      writeRow(sheet, [
        e.description,
        { quantity: e.no_of_units },
        { centavos: e.hourly_rate_centavos },
        { quantity: e.productivity_per_hour },
        { centavos: dupaAmount({ equipment: [equipment[index]!] }, 'equipment') },
      ])
    })
    writeRow(sheet, ['Subtotal C', null, null, null, { centavos: subtotals.equipmentSubtotalCentavos }], true)

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
  workbook.creator = 'Third Code ERP'
  workbook.created = exportedAt
  addBoqSheet(workbook, data, exportedAt)
  addDupaSheet(workbook, boqExportLines(data.lines), data.dupas)
  return workbook
}
