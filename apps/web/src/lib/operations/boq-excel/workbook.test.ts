import { createRequire } from 'node:module'
import { computeBomTotals } from '@third-code-erp/shared-types/bom'
import * as ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseStructuredTakeoff } from '@/lib/operations/integrations/takeoff'
import { cellCentavos } from './cells'
import {
  BOQ_EXPORT_HEADERS,
  boqExportFileName,
  writeBoqWorkbook,
  type BoqExportData,
  type BoqExportDupa,
  type BoqExportLine,
} from './workbook'

const require = createRequire(import.meta.url)

const EXPORTED_AT = new Date('2026-11-05T16:30:00.000Z') // 2026-11-06 00:30 Manila

function line(overrides: Partial<BoqExportLine>): BoqExportLine {
  return {
    id: overrides.id ?? 'line',
    item_no: null,
    code: null,
    description: 'Line',
    division_id: null,
    division: null,
    location: null,
    unit: 'lot',
    quantity: '1',
    unit_cost_cents: 0,
    line_total_cents: 0,
    unit_rate_source: 'manual',
    notes: null,
    is_group: 0,
    parent_line_item_id: null,
    ...overrides,
  }
}

const LINES: BoqExportLine[] = [
  line({
    id: 'a',
    item_no: '1.1',
    code: 'EW-01',
    description: 'Excavation',
    division_id: 'd1',
    division: 'Earthworks',
    location: 'Zone A',
    unit: 'cu.m',
    quantity: '12.3456',
    unit_cost_cents: 45_050,
    line_total_cents: 556_166,
    unit_rate_source: 'client_boq',
  }),
  line({
    id: 'b',
    item_no: '2.1',
    description: 'Footing concrete',
    division_id: 'd2',
    division: 'Concrete',
    unit: 'cu.m',
    quantity: '2.5',
    unit_cost_cents: 650_001,
    line_total_cents: 1_625_003,
    unit_rate_source: 'dupa',
  }),
  // Material lines are carried by their work item and never listed.
  line({
    id: 'b-cement',
    description: 'Cement',
    division_id: 'd2',
    division: 'Concrete',
    unit: 'bag',
    quantity: '20',
    unit_cost_cents: 30_000,
    line_total_cents: 600_000,
    parent_line_item_id: 'b',
  }),
  line({
    id: 'c',
    item_no: '1.2',
    description: '=HYPERLINK("x")\u0007',
    division_id: 'd1',
    division: 'Earthworks',
    unit: 'sqm',
    quantity: '0.3333',
    unit_cost_cents: 1_000_000,
    line_total_cents: 333_300,
    notes: '+cmd|calc',
  }),
  line({ id: 'g', description: 'General requirements', is_group: 1, quantity: '0', unit: null }),
]

// Stored totals worked by hand, independent of computeBomTotals:
// cost = 5,561.69 + 16,250.03 + 3,333.00 (the cement is inside line b);
// TCV = the stored line totals 5,561.66 + 16,250.03 + 3,333.00.
const BOM_TOTALS = {
  total_cost_cents: 2_514_472,
  tcv_cents: 2_514_469,
  gp_cents: -3,
  gp_margin_bps: 0,
}

function exportData(): BoqExportData {
  return {
    project: { name: 'Clinic fit-out', code: 'PRJ/001', client: 'Somnus Studios' },
    bom: { version: 3, status: 'draft', label: null, ...BOM_TOTALS },
    lines: LINES,
    dupas: [
      {
        bom_line_item_id: 'b',
        header_quantity: '1.0000',
        uom: 'cu.m',
        ocm_bps: 800,
        profit_bps: 700,
        vat_bps: 1200,
        direct_cost_centavos: 600_000n,
        indirect_cost_centavos: 90_000n,
        vat_centavos: 72_000n,
        total_cost_centavos: 762_000n,
        unit_rate_centavos: 762_000n,
        materials: [
          { description: 'Cement', quantity: '10.0000', uom: 'bag', unit_rate_centavos: 30_000n },
        ],
        labour: [
          {
            description: 'Mason',
            no_of_persons: '2.00',
            hourly_rate_centavos: 15_000n,
            productivity_per_hour: '1.0000',
          },
        ],
        equipment: [],
      },
    ],
  }
}

async function roundTrip(data: BoqExportData): Promise<{ buffer: Buffer; workbook: ExcelJS.Workbook }> {
  const buffer = await writeBoqWorkbook(data, EXPORTED_AT)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  return { buffer, workbook }
}

function headerRowNumber(sheet: ExcelJS.Worksheet): number {
  let found = 0
  sheet.eachRow((row, number) => {
    if (!found && row.getCell(1).value === 'Item No') found = number
  })
  return found
}

/** The Amount cells of the line rows, summed in centavos, and the totals rows by label. */
function readBoqTotals(workbook: ExcelJS.Workbook): { amountCentavos: number; totals: Map<string, unknown> } {
  const sheet = workbook.getWorksheet('BOQ')!
  const header = headerRowNumber(sheet)
  let amountCentavos = 0
  const totals = new Map<string, unknown>()
  sheet.eachRow((row, number) => {
    if (number <= header) return
    const label = String(row.getCell(3).value ?? '')
    if (label.startsWith('Total')) {
      totals.set(label, row.getCell(9).value)
      return
    }
    const amount = cellCentavos(row.getCell(9).value, Number.MAX_SAFE_INTEGER)
    if (amount.ok) amountCentavos += amount.value
  })
  return { amountCentavos, totals }
}

describe('BOQ workbook export', () => {
  it('writes the header block, headers, typed cells and number formats', async () => {
    const { workbook } = await roundTrip(exportData())
    const sheet = workbook.getWorksheet('BOQ')!

    expect(sheet.getCell('A1').value).toBe('Bill of Quantities')
    expect(sheet.getCell('B2').value).toBe('Clinic fit-out (PRJ/001)')
    expect(sheet.getCell('B3').value).toBe('Somnus Studios')
    expect(sheet.getCell('B4').value).toBe('v3 · draft')
    expect(sheet.getCell('B5').value).toBe('2026-11-06 00:30 (Asia/Manila)')
    expect(sheet.getCell('B6').value).toBe('PHP')

    const header = headerRowNumber(sheet)
    expect(header).toBe(8)
    expect(BOQ_EXPORT_HEADERS.map((_, index) => sheet.getRow(header).getCell(index + 1).value)).toEqual([
      ...BOQ_EXPORT_HEADERS,
    ])

    // Page order: division groups in first-seen order, sort order inside.
    const first = sheet.getRow(header + 1)
    expect(first.getCell(1).value).toBe('1.1')
    expect(first.getCell(1).type).toBe(ExcelJS.ValueType.String)
    expect(first.getCell(7).value).toBe(12.3456)
    expect(first.getCell(7).numFmt).toBe('#,##0.0000')
    expect(first.getCell(8).value).toBe(450.5)
    expect(first.getCell(8).numFmt).toBe('#,##0.00')
    // 12.3456 x 450.50 = 5,561.6928 -> 5,561.69
    expect(first.getCell(9).value).toBe(5561.69)
    expect(first.getCell(10).value).toBe('Client BOQ')

    const descriptions: unknown[] = []
    sheet.eachRow((row, number) => {
      if (number > header) descriptions.push(row.getCell(3).value)
    })
    expect(descriptions).not.toContain('Cement')
  })

  it('writes formula-looking text as plain strings without control characters', async () => {
    const { workbook } = await roundTrip(exportData())
    const sheet = workbook.getWorksheet('BOQ')!
    const header = headerRowNumber(sheet)
    const injected = sheet.getRow(header + 2)

    expect(injected.getCell(3).type).toBe(ExcelJS.ValueType.String)
    expect(injected.getCell(3).value).toBe('=HYPERLINK("x")')
    expect(injected.getCell(11).type).toBe(ExcelJS.ValueType.String)
    expect(injected.getCell(11).value).toBe('+cmd|calc')
  })

  it('sets quotePrefix only on text that starts like a formula', async () => {
    const { buffer } = await roundTrip(exportData())
    const { CFB } = require('xlsx') as typeof import('xlsx')
    const zip = CFB.read(buffer, { type: 'buffer' })
    const part = (path: string) => Buffer.from(CFB.find(zip, path).content).toString('utf8')
    const xfs = [...part('/xl/styles.xml').match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)![1]!.matchAll(/<xf\b[^>]*>/g)]
      .map((match) => match[0])
    const sheet = part('/xl/worksheets/sheet1.xml')
    const styleOf = (ref: string) => xfs[Number(new RegExp(`<c r="${ref}"[^>]*\\bs="(\\d+)"`).exec(sheet)?.[1] ?? 0)]!

    // Row 10 is the "=HYPERLINK" line: description C10 and notes K10 ("+cmd|calc").
    expect(styleOf('C10')).toContain('quotePrefix="1"')
    expect(styleOf('K10')).toContain('quotePrefix="1"')
    expect(styleOf('C9')).not.toContain('quotePrefix')
    expect(styleOf('A9')).not.toContain('quotePrefix')
  })

  it('renders group lines as bold section rows', async () => {
    const { workbook } = await roundTrip(exportData())
    const sheet = workbook.getWorksheet('BOQ')!
    let group: ExcelJS.Row | undefined
    sheet.eachRow((row) => {
      if (row.getCell(3).value === 'General requirements') group = row
    })

    expect(group?.font?.bold ?? group?.getCell(3).font?.bold).toBe(true)
    expect(group?.getCell(7).value ?? null).toBeNull()
  })

  it('prints totals that are the sum of the printed lines when the stored totals are stale', async () => {
    // The cement was nested under line b (a resolved grain review) and the
    // BOM record still counts it: P6,000.00 more than its lines add up to.
    const current = computeBomTotals(LINES)
    const stored = {
      ...current,
      total_cost_cents: current.total_cost_cents + 600_000,
      tcv_cents: current.tcv_cents + 600_000,
    }
    const { buffer, workbook } = await roundTrip({ ...exportData(), bom: { ...exportData().bom, ...stored } })
    const { amountCentavos, totals } = readBoqTotals(workbook)
    const printed = (label: string) => {
      const value = cellCentavos(totals.get(label), Number.MAX_SAFE_INTEGER)
      return value.ok ? value.value : Number.NaN
    }
    const topLevelTcv = LINES.filter((line) => line.parent_line_item_id === null).reduce(
      (sum, line) => sum + line.line_total_cents,
      0,
    )

    expect(printed('Total cost')).toBe(amountCentavos)
    expect(printed('Total cost')).toBe(current.total_cost_cents)
    expect(printed('Total contract value (TCV)')).toBe(topLevelTcv)
    expect(totals.get('Total gross profit (GP)')).toBe((topLevelTcv - amountCentavos) / 100)
    // The out-of-date record is shown beside the computed totals, never instead of them.
    expect(printed('Total cost stored on the BOM (out of date)')).toBe(stored.total_cost_cents)
    expect(printed('Total contract value (TCV) stored on the BOM (out of date)')).toBe(stored.tcv_cents)

    const imported = await parseStructuredTakeoff(buffer, 'BOQ.xlsx', {
      description: 'Description',
      quantity: 'Quantity',
      unit: 'UOM',
    })
    expect(imported.rows).toHaveLength(3)
    expect(imported.warnings).toEqual([])
  })

  it('sums exported amounts to the total cost and prints no stored totals when they are current', async () => {
    const data = exportData()
    const { workbook } = await roundTrip(data)
    const { amountCentavos, totals } = readBoqTotals(workbook)

    expect([...totals.keys()]).toEqual([
      'Total cost',
      'Total contract value (TCV)',
      'Total gross profit (GP)',
      'Total GP margin',
    ])
    // 12.3456 x 450.50, 2.5 x 6,500.01 and 0.3333 x 10,000.00, each half-up.
    expect(amountCentavos).toBe(556_169 + 1_625_003 + 333_300)
    expect(amountCentavos).toBe(data.bom.total_cost_cents)
    expect(totals.get('Total cost')).toBe(25144.72)
    expect(totals.get('Total contract value (TCV)')).toBe(25144.69)
    expect(totals.get('Total gross profit (GP)')).toBe(-0.03)
    expect(totals.get('Total GP margin')).toBe(0)
  })

  it('adds a DUPA sheet with stored D-H totals for priced lines only', async () => {
    const { workbook } = await roundTrip(exportData())
    const dupa = workbook.getWorksheet('DUPA')!
    const rows: Array<[unknown, unknown]> = []
    dupa.eachRow((row) => rows.push([row.getCell(1).value, row.getCell(5).value]))

    expect(rows[0]).toEqual(['2.1 Footing concrete', null])
    expect(rows).toContainEqual(['Cement', 3000])
    expect(rows).toContainEqual(['Subtotal B', 300])
    expect(rows).toContainEqual(['D. Direct cost (A + B + C)', 6000])
    expect(rows).toContainEqual(['E. Indirect cost (OCM 8.00% + profit 7.00%)', 900])
    expect(rows).toContainEqual(['H. Unit rate per cu.m (G / output quantity)', 7620])

    const noDupa = await roundTrip({ ...exportData(), dupas: [] })
    expect(noDupa.workbook.getWorksheet('DUPA')).toBeUndefined()
  })

  it('notes under each DUPA subtotal that rounded lines may not add up to it', async () => {
    const sand = { description: 'Sand', quantity: '0.3333', uom: 'cu.m', unit_rate_centavos: 100n }
    const [base] = exportData().dupas as [BoqExportDupa]
    const { workbook } = await roundTrip({
      ...exportData(),
      dupas: [{ ...base, materials: [sand, sand, sand] }],
    })
    const rows: Array<[unknown, unknown]> = []
    workbook.getWorksheet('DUPA')!.eachRow((row) => rows.push([row.getCell(1).value, row.getCell(5).value]))

    // Each line is 0.3333 x 1.00 = 0.3333 -> 0.33; the exact sum 0.9999 -> 1.00.
    expect(rows.filter(([label]) => label === 'Sand')).toEqual([
      ['Sand', 0.33],
      ['Sand', 0.33],
      ['Sand', 0.33],
    ])
    const subtotalA = rows.findIndex(([label]) => label === 'Subtotal A')
    expect(rows[subtotalA]).toEqual(['Subtotal A', 1])
    const note = 'Lines are shown rounded; the subtotal is computed before rounding.'
    expect(rows[subtotalA + 1]).toEqual([note, null])
    expect(rows.filter(([label]) => label === note)).toHaveLength(3)
  })

  it('round-trips quantities, units, rates and divisions through the import', async () => {
    const { buffer } = await roundTrip(exportData())

    const imported = await parseStructuredTakeoff(buffer, 'BOQ.xlsx', {
      description: 'Description',
      quantity: 'Quantity',
      unit: 'UOM',
    })

    expect(imported.missingColumns).toEqual([])
    expect(imported.headerRow).toBe(8)
    expect(imported.warnings).toEqual([])
    expect(
      imported.rows.map((row) => [row.itemNo, row.quantity, row.unit, row.unitRateCentavos, row.division]),
    ).toEqual([
      ['1.1', 12.3456, 'cu.m', 45_050, 'Earthworks'],
      ['1.2', 0.3333, 'sqm', 1_000_000, 'Earthworks'],
      ['2.1', 2.5, 'cu.m', 650_001, 'Concrete'],
    ])
    expect(imported.sectionRows).toBe(1)
  })

  it('names the file from the project code, BOM version and Manila date', () => {
    expect(boqExportFileName(exportData(), EXPORTED_AT)).toBe('BOQ-PRJ-001-v3-20261106.xlsx')
    expect(
      boqExportFileName(
        { ...exportData(), project: { name: '../Café "Main"', code: null, client: null } },
        EXPORTED_AT,
      ),
    ).toBe('BOQ-Caf-Main-v3-20261106.xlsx')
  })
})
