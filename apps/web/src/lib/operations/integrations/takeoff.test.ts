import { createRequire } from 'node:module'
import { lineTotal } from '@third-code-erp/shared-types/bom'
import { describe, expect, it } from 'vitest'
import {
  assertXlsxWithinLimits,
  buildTakeoffImportKey,
  parseStructuredTakeoff,
  TAKEOFF_TOO_MUCH_DATA_MESSAGE,
  TakeoffTooLargeError,
  validateTakeoffRows,
  XLSX_LIMITS,
  type TakeoffColumnMapping,
} from './takeoff'

const MAPPING = { description: 'Description', quantity: 'Quantity', unit: 'UOM' }

const require = createRequire(import.meta.url)
const { CFB } = require('xlsx') as typeof import('xlsx')
// The zip reader inside ExcelJS: an attack file only counts if it still reads it.
const JSZip = createRequire(require.resolve('exceljs'))('jszip') as {
  new (): {
    file(name: string, content: string): void
    generateAsync(options: { type: 'nodebuffer'; compression: 'DEFLATE' }): Promise<Buffer>
  }
  loadAsync(data: Buffer): Promise<{ files: Record<string, unknown> }>
}
const ZIP_END = Buffer.from([0x50, 0x4b, 0x05, 0x06])

async function boqWorkbook(dataRows = 1): Promise<Buffer> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('BOQ')
  sheet.addRow(['Description', 'Quantity', 'UOM'])
  for (let row = 0; row < dataRows; row += 1) sheet.addRow(['Paint', 1, 'sqm'])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** Rewrites parts of an .xlsx, or adds them, with the SheetJS zip codec. */
function patchXlsx(buffer: Buffer, edits: Record<string, (xml: string) => string>): Buffer {
  const zip = CFB.read(buffer, { type: 'buffer' })
  for (const [path, edit] of Object.entries(edits)) {
    const part = CFB.find(zip, path)
    const content = Buffer.from(edit(part ? Buffer.from(part.content).toString('utf8') : ''))
    if (part) part.content = content
    else CFB.utils.cfb_add(zip, path, content)
  }
  return Buffer.from(CFB.write(zip, { fileType: 'zip', type: 'buffer', compression: true }))
}

const SHEET = '/xl/worksheets/sheet1.xml'
const afterSheetData = (xml: string) => (sheet: string) => sheet.replace('</sheetData>', `</sheetData>${xml}`)
const parseCsv = (lines: string[], mapping: TakeoffColumnMapping = MAPPING) =>
  parseStructuredTakeoff(Buffer.from(lines.join('\n')), 'takeoff.csv', mapping)

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
        'A-001,Ceiling duplicate,2,crate,',
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
      { sourceRowKey: 'A-001', code: 'INVALID_UOM', message: 'UOM "crate" is not recognized.' },
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
      // 0.1 + 0.2 is float noise (no warning); 12.34565 really loses a digit.
      {
        sourceRowKey: 'row-3',
        code: 'QUANTITY_ROUNDED',
        message: 'Quantity 12.34565 was rounded to 12.3457.',
      },
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

  it('imports a rate or a lump-sum amount with no quantity instead of making it a header', async () => {
    const csv = [
      'Description,Qty,UOM,Unit Rate,Amount',
      'GENERAL REQUIREMENTS,,,,',
      'Mobilization,,,"50,000.00",',
      'Permits,,lot,,"12,000.00"',
    ].join('\n')

    const result = await parseStructuredTakeoff(Buffer.from(csv), 'takeoff.csv', MAPPING)

    expect(result.sectionRows).toBe(1)
    // A rate with no quantity stays for review; an amount with no quantity and
    // a lump-sum unit is quantity 1 at that amount (round 3, C3-3; owner
    // decision 2026-11-13: without that unit it is skipped, see below).
    expect(
      result.rows.map((row) => [row.description, row.quantity, row.unitRateCentavos, row.division]),
    ).toEqual([
      ['Mobilization', null, 5_000_000, 'GENERAL REQUIREMENTS'],
      ['Permits', 1, 1_200_000, 'GENERAL REQUIREMENTS'],
    ])
    expect(
      validateTakeoffRows(result.rows)
        .filter((issue) => issue.code === 'INVALID_QUANTITY')
        .map((issue) => issue.sourceRowKey),
    ).toEqual(['row-3'])
    expect(result.warnings).toEqual([
      {
        sourceRowKey: 'row-4',
        code: 'LUMP_SUM',
        message: 'No quantity: imported as a lump sum, quantity 1 at PHP 12,000.00.',
      },
    ])
  })

  it('skips and lists amount-only rows unless the unit is ls, l.s. or lot (owner decision, A.5)', async () => {
    const result = await parseCsv([
      'Item,Description,Quantity,UOM,Unit Rate,Amount',
      '1,Excavation,10,cu.m,"1,000.00","10,000.00"',
      '2,Mobilization,,ls,,"50,000.00"',
      '3,Permits,,LOT,,"12,000.00"',
      '4,Bonds,, L.S. ,,"3,000.50"',
      '5,Formwork,,m2,,"8,000.00"',
      ',SUBTOTAL,,,,"83,000.50"',
      ',VAT 12%,,,,"9,960.06"',
      ',TOTAL,,,,"92,960.56"',
      'GRAND TOTAL,,,,,"92,960.56"',
    ])

    expect(result.rows.map((row) => [row.description, row.quantity, row.unit, row.unitRateCentavos])).toEqual([
      ['Excavation', 10, 'cu.m', 100_000],
      ['Mobilization', 1, 'ls', 5_000_000],
      ['Permits', 1, 'lot', 1_200_000],
      ['Bonds', 1, 'l.s.', 300_050],
    ])
    const totalRow = 'Total row (its description starts with Total, Subtotal or Grand total and it has no unit).'
    const amountOnly = 'Amount with no quantity: only a row whose unit is ls, l.s. or lot is imported as a lump sum.'
    expect(result.skippedRows).toBe(5)
    expect(result.skippedAmountRows).toEqual([
      { sheet: null, row: 6, label: 'Formwork', amount: '8,000.00', reason: amountOnly },
      { sheet: null, row: 7, label: 'SUBTOTAL', amount: '83,000.50', reason: totalRow },
      { sheet: null, row: 8, label: 'VAT 12%', amount: '9,960.06', reason: amountOnly },
      { sheet: null, row: 9, label: 'TOTAL', amount: '92,960.56', reason: totalRow },
      // A total label in the Item column, Description blank.
      { sheet: null, row: 10, label: 'GRAND TOTAL', amount: '92,960.56', reason: amountOnly },
    ])
    expect(result.warnings.map((warning) => [warning.sourceRowKey, warning.code])).toEqual([
      ['row-3', 'LUMP_SUM'],
      ['row-4', 'LUMP_SUM'],
      ['row-5', 'LUMP_SUM'],
    ])
    // The BOM gets the lines, never the subtotal, VAT or total on top of them.
    const imported = result.rows.reduce(
      (sum, row) => sum + lineTotal(row.unitRateCentavos ?? 0, String(row.quantity), 0),
      0,
    )
    expect(imported).toBe(7_500_050)
    expect(validateTakeoffRows(result.rows).filter((issue) => issue.code !== 'MISSING_DIVISION')).toEqual([])
  })

  it('does not fall back to rate aliases when the rate mapping is blanked', async () => {
    const csv = 'Description,Qty,UOM,Rate\nPaint,4,sqm,150'

    const auto = await parseStructuredTakeoff(Buffer.from(csv), 'takeoff.csv', MAPPING)
    const off = await parseStructuredTakeoff(Buffer.from(csv), 'takeoff.csv', {
      ...MAPPING,
      unitRate: '',
    })

    expect(auto.rows[0]?.unitRateCentavos).toBe(15_000)
    expect(off.rows[0]).not.toHaveProperty('unitRateCentavos')
  })

  it('maps a header cell merged across two columns to its first column', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('BOQ')
    sheet.addRow(['Item', 'Description', '', 'Qty', 'Unit'])
    sheet.mergeCells('B1:C1')
    sheet.addRow(['1', 'Excavation', 'see note', 3, 'cu.m'])
    sheet.addRow(['2', 'Backfill', '', 2, 'cu.m'])
    sheet.mergeCells('B3:C3')
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING)

    expect(result.missingColumns).toEqual([])
    expect(result.rows.map((row) => [row.itemNo, row.description, row.quantity, row.unit])).toEqual([
      ['1', 'Excavation', 3, 'cu.m'],
      ['2', 'Backfill', 2, 'cu.m'],
    ])
  })

  it('rejects a sheet whose used range reaches a far column before building rows', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('BOQ')
    sheet.addRow(['Description', 'Quantity', 'UOM'])
    for (let row = 2; row <= 50; row += 1) sheet.getCell(row, 16_384).value = 1
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    await expect(parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING)).rejects.toThrow(
      TakeoffTooLargeError,
    )
  })

  it('rejects a workbook over the uncompressed budget or with a lying size header', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('BOQ').addRow(['Description', 'Quantity', 'UOM'])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    expect(() => assertXlsxWithinLimits(buffer)).not.toThrow()
    expect(() => assertXlsxWithinLimits(buffer, { ...XLSX_LIMITS, uncompressedBytes: 1_000 })).toThrow(
      TakeoffTooLargeError,
    )

    // First central-directory entry claims 1 byte uncompressed.
    const lying = Buffer.from(buffer)
    const entry = lying.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    lying.writeUInt32LE(1, entry + 24)
    expect(() => assertXlsxWithinLimits(lying)).toThrow()
  })

  it('refuses a zip whose directory hides a part from the guard but not from the reader', async () => {
    const hidden = 'xl/worksheets/sheet9.xml'
    const honest = patchXlsx(await boqWorkbook(), { [`/${hidden}`]: () => ' '.repeat(200_000) })
    const limits = { ...XLSX_LIMITS, uncompressedBytes: 100_000 }
    expect(() => assertXlsxWithinLimits(honest, limits)).toThrow(TakeoffTooLargeError)

    // The end record declares one entry; JSZip reads every record that is there.
    const underDeclared = Buffer.from(honest)
    const end = underDeclared.lastIndexOf(ZIP_END)
    underDeclared.writeUInt16LE(1, end + 8)
    underDeclared.writeUInt16LE(1, end + 10)
    // One byte before the zip; JSZip re-bases every offset.
    const prepended = Buffer.concat([Buffer.from([0]), honest])

    for (const attack of [underDeclared, prepended]) {
      expect(Object.keys((await JSZip.loadAsync(attack)).files)).toContain(hidden)
      expect(() => assertXlsxWithinLimits(attack, limits)).toThrow()
      await expect(parseStructuredTakeoff(attack, 'boq.xlsx', MAPPING)).rejects.toThrow()
    }
  })

  it('refuses a zip it cannot fully account for instead of passing it on', async () => {
    const buffer = await boqWorkbook()
    const end = buffer.lastIndexOf(ZIP_END)
    const edited = (edit: (copy: Buffer) => void) => {
      const copy = Buffer.from(buffer)
      edit(copy)
      return copy
    }
    const directory = buffer.readUInt32LE(end + 16)

    expect(() => assertXlsxWithinLimits(buffer)).not.toThrow()
    expect(() => assertXlsxWithinLimits(Buffer.from('not a zip'))).toThrow()
    // Directory offset that does not lead to the directory.
    expect(() => assertXlsxWithinLimits(edited((copy) => copy.writeUInt32LE(0, end + 16)))).toThrow()
    // First entry: data outside the file, then an unknown compression method.
    expect(() =>
      assertXlsxWithinLimits(edited((copy) => copy.writeUInt32LE(0x7fffffff, directory + 42))),
    ).toThrow()
    expect(() => assertXlsxWithinLimits(edited((copy) => copy.writeUInt16LE(12, directory + 10)))).toThrow()
    expect(() => assertXlsxWithinLimits(buffer, { ...XLSX_LIMITS, entries: 2 })).toThrow(TakeoffTooLargeError)
  })

  it('refuses merged ranges that would expand past the cell budget', async () => {
    const merged = (ref: string) => async () =>
      parseStructuredTakeoff(
        patchXlsx(await boqWorkbook(), {
          [SHEET]: afterSheetData(`<mergeCells count="1"><mergeCell ref="${ref}"/></mergeCells>`),
        }),
        'boq.xlsx',
        MAPPING,
      )

    // 6 KB on disk; ExcelJS would build one object for each of the 980,000 cells.
    await expect(merged('D1:AZ20000')()).rejects.toThrow(TakeoffTooLargeError)
    await expect(merged('A1:XFD1048576')()).rejects.toThrow(TakeoffTooLargeError)
    // A range the guard cannot read exactly as ExcelJS would is refused too.
    await expect(merged('A1:XFD&#49;048576')()).rejects.toThrow()
    await expect(merged('D5:E6')()).resolves.toMatchObject({ rows: [{ description: 'Paint' }] })

    // ExcelJS compares every merged range with every other one on the sheet.
    const twoRanges = patchXlsx(await boqWorkbook(), {
      [SHEET]: afterSheetData('<mergeCells count="2"><mergeCell ref="D5:E6"/><mergeCell ref="D8:E9"/></mergeCells>'),
    })
    expect(() => assertXlsxWithinLimits(twoRanges)).not.toThrow()
    expect(() => assertXlsxWithinLimits(twoRanges, { ...XLSX_LIMITS, mergedRanges: 1 })).toThrow(
      TakeoffTooLargeError,
    )
  })

  it('counts rows and cells instead of trusting the declared dimension', async () => {
    // 31 rows, 93 cells and the 3 columns ExcelJS creates for them, behind a
    // dimension that claims one cell. The dimension tag counts as one itself
    // (each <dimension> and <col> tag read does, so a part full of them ends
    // the scan at the limit).
    const lying = patchXlsx(await boqWorkbook(30), {
      [SHEET]: (sheet) => sheet.replace(/<dimension[^>]*>/, '<dimension ref="A1"/>'),
    })

    expect(() => assertXlsxWithinLimits(lying, { ...XLSX_LIMITS, cells: 128 })).not.toThrow()
    expect(() => assertXlsxWithinLimits(lying, { ...XLSX_LIMITS, cells: 127 })).toThrow(TakeoffTooLargeError)

    // Two <col> tags add two.
    const withColumns = patchXlsx(lying, {
      [SHEET]: (sheet) =>
        sheet.replace('<sheetData>', '<cols><col min="1" max="1" width="9"/><col min="2" max="3" width="9"/></cols><sheetData>'),
    })
    expect(() => assertXlsxWithinLimits(withColumns, { ...XLSX_LIMITS, cells: 130 })).not.toThrow()
    expect(() => assertXlsxWithinLimits(withColumns, { ...XLSX_LIMITS, cells: 129 })).toThrow(TakeoffTooLargeError)
  })

  it('reads a workbook whose validations, column spans and names cover the whole sheet', async () => {
    // ExcelJS would expand each of these into one object per cell or column
    // (a column span past XFD is refused instead; see takeoff-xlsx-reader.test.ts).
    const hostile = patchXlsx(await boqWorkbook(), {
      [SHEET]: (sheet) =>
        afterSheetData(
          '<dataValidations count="1"><dataValidation type="list" sqref="A1:XFD1048576"><formula1>"a,b"</formula1></dataValidation></dataValidations>',
        )(sheet.replace('<sheetData>', '<cols><col min="1" max="16384" width="9"/></cols><sheetData>')),
      '/xl/workbook.xml': (book) =>
        book.replace(
          '</sheets>',
          '</sheets><definedNames><definedName name="all">BOQ!$A$1:$XFD$1048576</definedName></definedNames>',
        ),
    })

    const result = await parseStructuredTakeoff(hostile, 'boq.xlsx', MAPPING)

    expect(result.rows).toEqual([expect.objectContaining({ description: 'Paint', quantity: 1 })])
  })

  it('stops building rows once they pass the command byte budget', async () => {
    const header = ['Description', 'Quantity', 'UOM', ...Array.from({ length: 61 }, (_, index) => `C${index}`)]
    const wide = ['Paint', '1', 'sqm', ...Array.from({ length: 61 }, () => 'x'.repeat(1_000))].join(',')
    const rows = (count: number) => [header.join(','), ...Array.from({ length: count }, () => wide)]

    // 61 KB a row: 20 rows fit in the 2 MB command, 40 do not.
    expect((await parseCsv(rows(20))).rows).toHaveLength(20)
    await expect(parseCsv(rows(40))).rejects.toThrow(new TakeoffTooLargeError(TAKEOFF_TOO_MUCH_DATA_MESSAGE))
  })

  it('derives the unit rate from an amount only when it is exact to the centavo', async () => {
    const result = await parseCsv([
      'Description,Quantity,UOM,Total Amount',
      'Excavation,10,cu.m,"1,000.00"',
      'Tiles,0.3333,sqm,33.33',
      'Rebar,3,kg,100',
      'Signage,2,lot,0',
      'Mobilization,,LS,"150,000.00"',
      'Paint,TBD,sqm,100',
    ])

    expect(result.rows.map((row) => [row.description, row.quantity, row.unitRateCentavos])).toEqual([
      ['Excavation', 10, 10_000],
      // 0.3333 x 100.00 = 33.33 exactly as the shared lineTotal rounds it.
      ['Tiles', 0.3333, 10_000],
      // 100.00 / 3 = 33.33..., and 3 x 33.33 is 99.99: no rate, left for review.
      ['Rebar', 3, null],
      ['Signage', 2, undefined],
      ['Mobilization', 1, 15_000_000],
      ['Paint', null, undefined],
    ])
    for (const row of result.rows) {
      if (typeof row.unitRateCentavos !== 'number' || row.quantity === null) continue
      expect(lineTotal(row.unitRateCentavos, String(row.quantity), 0)).toBe(
        { Excavation: 100_000, Tiles: 3_333, Mobilization: 15_000_000 }[row.description],
      )
    }
    expect(result.warnings).toEqual([
      {
        sourceRowKey: 'row-4',
        code: 'AMOUNT_NOT_EXACT',
        message:
          'Amount PHP 100.00 divided by quantity 3 is not a whole-centavo unit rate, so no rate was derived and the line is left for review. Add a unit rate column or price the line after import.',
      },
      {
        sourceRowKey: 'row-6',
        code: 'LUMP_SUM',
        message: 'No quantity: imported as a lump sum, quantity 1 at PHP 150,000.00.',
      },
      { sourceRowKey: 'row-7', code: 'UNREADABLE_QUANTITY', message: 'Quantity is not a number.' },
      {
        sourceRowKey: 'row-7',
        code: 'AMOUNT_IGNORED',
        message: 'Amount PHP 100.00 is not imported because the quantity could not be read.',
      },
    ])
    // The inexact row is queued by Core; the lump sum's unit is one Core accepts.
    expect(validateTakeoffRows(result.rows).map((issue) => [issue.sourceRowKey, issue.code])).toEqual([
      ['row-2', 'MISSING_DIVISION'],
      ['row-3', 'MISSING_DIVISION'],
      ['row-4', 'INVALID_UNIT_RATE'],
      ['row-4', 'MISSING_DIVISION'],
      ['row-5', 'MISSING_DIVISION'],
      ['row-6', 'MISSING_DIVISION'],
      ['row-7', 'INVALID_QUANTITY'],
      ['row-7', 'MISSING_DIVISION'],
    ])

    // A rate column that is there but blank on the row behaves the same.
    const blankRate = await parseCsv(['Description,Quantity,UOM,Unit Rate,Amount', 'Permits,1,lot,,500'])
    expect(blankRate.rows[0]?.unitRateCentavos).toBe(50_000)
    expect(blankRate.warnings).toEqual([])
  })

  it('skips sub-total and grand-total spellings and keeps a "Total" line that has a unit', async () => {
    const result = await parseCsv([
      'Description,Quantity,UOM,Unit Rate,Amount',
      'Total station survey,1,lot,"85,000.00","85,000.00"',
      'Subtotal,,,,"85,000.00"',
      'TOTAL,34,,,',
      'SUB-TOTAL,,,,"85,000.00"',
      'Sub Total,,,,"85,000.00"',
      'GRAND TOTAL,,,,"85,000.00"',
      'Subtotal A,,,,"85,000.00"',
      'TOTAL COST,,,,"85,000.00"',
    ])

    expect(result.rows.map((row) => [row.description, row.quantity, row.unitRateCentavos])).toEqual([
      ['Total station survey', 1, 8_500_000],
    ])
    expect(result.skippedRows).toBe(7)
    // The total row that carries a quantity is reported, not dropped silently.
    expect(result.warnings).toEqual([
      {
        sourceRowKey: 'row-4',
        code: 'TOTAL_ROW_SKIPPED',
        message: '"TOTAL" has a quantity but no unit; it was read as a total row and not imported.',
      },
    ])
  })

  it('keeps a quoted multi-line CSV cell in one record and a later quote as text', async () => {
    const result = await parseCsv(
      [
        'Description,Quantity,UOM,Division',
        '"Concrete footing',
        'incl. formwork, 2"" rebar",3,cu.m,Concrete',
        '2" PVC pipe,5,lm,Plumbing',
      ],
      { ...MAPPING, division: 'Division' },
    )

    expect(result.sectionRows).toBe(0)
    expect(result.rows.map((row) => [row.sourceRowKey, row.description, row.quantity, row.division])).toEqual([
      ['row-2', 'Concrete footing\nincl. formwork, 2" rebar', 3, 'Concrete'],
      ['row-3', '2" PVC pipe', 5, 'Plumbing'],
    ])
  })

  it('parses a CSV cell of 300,000 quotes in linear time (S5-1)', async () => {
    // The reviewers' file: each quote after text used to re-trim the whole cell (19 s at 300 KB).
    const csv = Buffer.from(`Description,Quantity,UOM\nPipe${'"'.repeat(300_000)},3,m\n`)

    const started = performance.now()
    const result = await parseStructuredTakeoff(csv, 'boq.csv', MAPPING)

    expect(performance.now() - started).toBeLessThan(1_000)
    expect(result.rows).toEqual([
      expect.objectContaining({ description: `Pipe${'"'.repeat(996)}`, quantity: 3, unit: 'm' }),
    ])
  })

  it('warns when a description is cut at 1,000 characters', async () => {
    const result = await parseCsv([
      'Description,Quantity,UOM',
      `${'x'.repeat(1_200)},1,sqm`,
      `${'y'.repeat(1_000)},1,sqm`,
    ])

    expect(result.rows.map((row) => row.description.length)).toEqual([1_000, 1_000])
    expect(result.warnings).toEqual([
      {
        sourceRowKey: 'row-2',
        code: 'TEXT_TRUNCATED',
        message: 'Description is longer than 1,000 characters and was cut.',
      },
    ])
  })

  it('rejects a CSV with content past the read window and caps its columns', async () => {
    const header = 'Description,Qty,UOM'
    const tooLong = [header, ...Array.from({ length: 5_100 }, () => ''), 'Paint,1,sqm'].join('\n')
    await expect(parseStructuredTakeoff(Buffer.from(tooLong), 'takeoff.csv', MAPPING)).rejects.toThrow(
      TakeoffTooLargeError,
    )

    const wide = `${header}${',x'.repeat(100)}\nPaint,1,sqm`
    const result = await parseStructuredTakeoff(Buffer.from(wide), 'takeoff.csv', MAPPING)
    expect(result.headers).toHaveLength(64)
    expect(result.rows).toHaveLength(1)
  })

  it('refuses a CSV over 5 MB before parsing it (S5, S6-4)', async () => {
    const limit = 5 * 1024 * 1024
    const rows = 'Description,Qty,UOM\nPaint,4,sqm\n'
    // Blank lines after the rows are not content; they only make the file this size.
    const atTheLimit = Buffer.from(rows + '\n'.repeat(limit - rows.length))
    // The reviewers' shape, one cell of plain text, just past the limit.
    const oneCell = Buffer.from(`Description,Qty,UOM\n${'a'.repeat(limit)},4,sqm\n`)

    expect((await parseStructuredTakeoff(atTheLimit, 'takeoff.csv', MAPPING)).rows).toHaveLength(1)
    const started = performance.now()
    await expect(parseStructuredTakeoff(oneCell, 'TAKEOFF.CSV', MAPPING)).rejects.toThrow(
      new TakeoffTooLargeError('The CSV file is larger than 5 MB. Split it and import each part.'),
    )
    expect(performance.now() - started).toBeLessThan(100)
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
