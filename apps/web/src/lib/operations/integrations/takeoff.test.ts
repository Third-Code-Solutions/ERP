import { describe, expect, it } from 'vitest'
import {
  buildTakeoffImportKey,
  parseStructuredTakeoff,
  validateTakeoffRows,
} from './takeoff'

const MAPPING = { description: 'Description', quantity: 'Quantity', unit: 'UOM' }

describe('structured takeoff importer', () => {
  it('parses an XLSX workbook through the production ExcelJS dependency', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Takeoff')
    worksheet.addRow(['Description', 'Quantity', 'UOM'])
    worksheet.addRow(['Concrete footing', 12, 'm3'])

    const result = await parseStructuredTakeoff(
      Buffer.from(await workbook.xlsx.writeBuffer()),
      'takeoff.xlsx',
      {
        description: 'Description',
        quantity: 'Quantity',
        unit: 'UOM',
      },
    )

    expect(result.missingColumns).toEqual([])
    expect(result.rows).toEqual([
      expect.objectContaining({
        description: 'Concrete footing',
        quantity: 12,
        unit: 'm3',
      }),
    ])
  })

  it('parses a mapped CSV without coupling to a producer name', async () => {
    const csv = [
      'Row,Description,Qty,UOM,Division,Location,Notes',
      'A-001,Suspended ceiling,12.5,sqm,Finishes,Level 2,Reflected ceiling plan',
    ].join('\n')

    const result = await parseStructuredTakeoff(
      Buffer.from(csv),
      'takeoff.csv',
      {
        sourceRowKey: 'Row',
        description: 'Description',
        quantity: 'Qty',
        unit: 'UOM',
        division: 'Division',
        location: 'Location',
        notes: 'Notes',
      },
    )

    expect(result.rows).toEqual([
      expect.objectContaining({
        sourceRowKey: 'A-001',
        description: 'Suspended ceiling',
        quantity: 12.5,
        unit: 'sqm',
        division: 'Finishes',
        location: 'Level 2',
      }),
    ])
    expect(result.missingColumns).toEqual([])
  })

  it('returns a structured missing-column result instead of dropping the file', async () => {
    const result = await parseStructuredTakeoff(
      Buffer.from('Description,Qty\nPaint,4'),
      'takeoff.csv',
      {
        sourceRowKey: 'Row',
        description: 'Description',
        quantity: 'Qty',
        unit: 'UOM',
      },
    )

    expect(result.rows).toEqual([])
    expect(result.missingColumns).toEqual(['UOM'])
  })

  it('flags invalid UOM, missing division, and duplicate source keys', async () => {
    const result = await parseStructuredTakeoff(
      Buffer.from([
        'Row,Description,Qty,UOM,Division',
        'A-001,Ceiling,1,sqm,Finishes',
        'A-001,Ceiling duplicate,2,box,',
      ].join('\n')),
      'takeoff.csv',
      {
        sourceRowKey: 'Row',
        description: 'Description',
        quantity: 'Qty',
        unit: 'UOM',
        division: 'Division',
      },
    )

    const validation = validateTakeoffRows(result.rows)

    expect(validation).toEqual([
      { sourceRowKey: 'A-001', code: 'DUPLICATE_SOURCE_ROW_KEY', message: 'Source row key is duplicated in this import.' },
      { sourceRowKey: 'A-001', code: 'INVALID_UOM', message: 'UOM "box" is not recognized.' },
      { sourceRowKey: 'A-001', code: 'MISSING_DIVISION', message: 'Division is required before import.' },
    ])
  })

  it('lists sheets, reads the chosen one, and auto-detects a lower header row', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Cover').addRow(['Not a BOQ'])
    const boq = workbook.addWorksheet('BOQ')
    boq.addRow(['Project', 'Clinic fit-out'])
    boq.addRow([])
    boq.addRow(['Item No', 'Description', 'Unit', 'Qty', 'Unit Rate (PHP)', 'Amount (PHP)'])
    boq.addRow(['1', 'Concrete footing', 'cu.m', 2.5, 4500, 11250])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING, { sheet: 'BOQ' })

    expect(result.workbook).toEqual({ sheets: ['Cover', 'BOQ'], sheet: 'BOQ' })
    expect(result.headerRow).toBe(3)
    expect(result.missingColumns).toEqual([])
    expect(result.rows).toEqual([
      expect.objectContaining({
        sourceRowKey: 'row-4',
        itemNo: '1',
        description: 'Concrete footing',
        quantity: 2.5,
        unit: 'cu.m',
        unitRateCentavos: 450_000,
      }),
    ])
    expect(result.warnings).toEqual([])

    const explicit = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING, {
      sheet: 'BOQ',
      headerRow: 1,
    })
    expect(explicit.missingColumns).toEqual(['Description', 'Quantity', 'UOM'])
    expect(
      (await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING)).workbook?.sheet,
    ).toBe('Cover')
  })

  it('carries section headers down as the division and skips blank and total rows', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('BOQ')
    sheet.addRow(['Description', 'Quantity', 'UOM', 'Division'])
    sheet.addRow(['Earthworks'])
    sheet.mergeCells('A2:D2')
    sheet.addRow(['Excavation', 10, 'cu.m', ''])
    sheet.addRow(['Backfill', 4, 'cu.m', 'Civil'])
    sheet.addRow([])
    sheet.addRow(['Subtotal earthworks', '', '', ''])
    sheet.addRow(['CONCRETE WORKS', null, null, null])
    sheet.addRow(['Slab', { formula: 'B3*2', result: 20 }, 'cu.m', ''])
    sheet.addRow(['TOTAL', 34, '', ''])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING)

    expect(result.rows.map((row) => [row.description, row.quantity, row.division])).toEqual([
      ['Excavation', 10, 'Earthworks'],
      ['Backfill', 4, 'Civil'],
      ['Slab', 20, 'CONCRETE WORKS'],
    ])
    expect(result.skippedRows).toBe(3)
    expect(result.sectionRows).toBe(2)

    const flat = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING, { sectionHeaders: false })
    expect(flat.sectionRows).toBe(0)
    expect(flat.rows.map((row) => row.description)).toContain('Earthworks')
  })

  it('reads a section header merged from a column left of Description', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('BOQ')
    sheet.addRow(['Item', 'Description', 'Qty', 'Unit'])
    sheet.addRow(['A. EARTHWORKS'])
    sheet.mergeCells('A2:D2')
    sheet.addRow(['1', 'Excavation', 3, 'cu.m'])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING)

    expect(result.rows).toEqual([
      expect.objectContaining({ itemNo: '1', description: 'Excavation', division: 'A. EARTHWORKS' }),
    ])
  })

  it('rounds numbers, queues unreadable cells and warns on amount mismatch', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('BOQ')
    sheet.addRow(['Description', 'Quantity', 'UOM', 'Unit Rate', 'Amount'])
    sheet.addRow(['Paint', 0.1 + 0.2, 'sqm', '₱ 1,000.00', '300.00'])
    sheet.addRow(['Tiles', 12.34565, 'sqm', 'PHP100', 999])
    sheet.addRow(['Grout', { formula: 'X1' }, 'kg', -5, ''])
    sheet.addRow(['Sealant', 2, 'l', 'n/a', 'abc'])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING)

    expect(result.rows.map((row) => [row.quantity, row.unitRateCentavos])).toEqual([
      [0.3, 100_000],
      [12.3457, 10_000],
      [null, null],
      [2, null],
    ])
    expect(result.warnings).toEqual([
      {
        sourceRowKey: 'row-3',
        code: 'AMOUNT_MISMATCH',
        message:
          'Amount PHP 999.00 differs from quantity x unit rate PHP 1,234.57; the system amount is used.',
      },
      {
        sourceRowKey: 'row-4',
        code: 'UNREADABLE_QUANTITY',
        message: 'Quantity is a formula with no saved result (open and save it in Excel).',
      },
      { sourceRowKey: 'row-4', code: 'UNREADABLE_UNIT_RATE', message: 'Unit rate is negative.' },
      { sourceRowKey: 'row-5', code: 'UNREADABLE_UNIT_RATE', message: 'Unit rate is not a number.' },
      { sourceRowKey: 'row-5', code: 'UNREADABLE_AMOUNT', message: 'Amount is not a number.' },
    ])
    expect(validateTakeoffRows(result.rows).map((issue) => [issue.sourceRowKey, issue.code])).toEqual(
      expect.arrayContaining([
        ['row-4', 'INVALID_QUANTITY'],
        ['row-4', 'INVALID_UNIT_RATE'],
        ['row-5', 'INVALID_UNIT_RATE'],
      ]),
    )
  })

  it('leaves the rate off rows when no rate column exists', async () => {
    const result = await parseStructuredTakeoff(
      Buffer.from('Description,Qty,UOM\nPaint,4,sqm\n\n'),
      'takeoff.csv',
      MAPPING,
    )

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).not.toHaveProperty('unitRateCentavos')
    expect(result.skippedRows).toBe(0)
  })

  it('creates a stable import key from source, drawing revision, and file digest', () => {
    const first = buildTakeoffImportKey('CAD', 'revision-1', 'abc123')
    const second = buildTakeoffImportKey('CAD', 'revision-1', 'abc123')
    const different = buildTakeoffImportKey('CAD', 'revision-2', 'abc123')

    expect(first).toBe(second)
    expect(first).not.toBe(different)
  })
})
