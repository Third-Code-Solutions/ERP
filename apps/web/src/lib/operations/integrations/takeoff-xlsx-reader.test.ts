// Round 3 security review: every attack file the reviewers ran is built here
// and must be refused by the first filter or stopped by the reader's limits,
// with the request thread still responsive. Real workbooks must still import.
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  assertXlsxWithinLimits,
  parseStructuredTakeoff,
  TakeoffBusyError,
  TakeoffTooLargeError,
} from './takeoff'
import { readXlsxSheet, XLSX_READER_LIMITS, type XlsxSheetRequest } from './takeoff-xlsx-reader'

const require = createRequire(import.meta.url)
const JSZip = createRequire(require.resolve('exceljs'))('jszip') as {
  new (): {
    file(name: string, content: string): void
    generateAsync(options: { type: 'nodebuffer'; compression: 'DEFLATE' }): Promise<Buffer>
  }
}

const MAPPING = { description: 'Description', quantity: 'Quantity', unit: 'UOM' }
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
const REQUEST: XlsxSheetRequest = {
  lastRow: 5_051,
  maxColumns: 64,
  maxText: 1_001,
  maxGridText: 4_000_000,
  ignoreNodes: [],
}
// The worker loads ExcelJS from a cold disk on a busy machine.
const SLOW = 60_000

interface SheetSpec {
  id?: number
  xml: string
}

const sheetXml = (rows: string, after = '') =>
  `<?xml version="1.0" encoding="UTF-8"?><worksheet ${NS}><sheetData>${rows}</sheetData>${after}</worksheet>`
const textRow = (row: number, values: string[]) =>
  `<row r="${row}">${values
    .map((value, index) => `<c r="${String.fromCharCode(65 + index)}${row}" t="inlineStr"><is><t>${value}</t></is></c>`)
    .join('')}</row>`
const HEADER = textRow(1, ['Description', 'Quantity', 'UOM'])
const PIPE = textRow(2, ['Pipe', '3', 'm'])

/** A minimal .xlsx written part by part, so a part can hold anything. */
async function xlsx(sheets: SheetSpec[], parts: Record<string, string> = {}): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  )
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((sheet, index) => `<sheet name="S${index + 1}" sheetId="${sheet.id ?? index + 1}" r:id="rId${index + 1}"/>`)
      .join('')}</sheets></workbook>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_sheet, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join('')}</Relationships>`,
  )
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, sheet.xml))
  for (const [name, content] of Object.entries(parts)) zip.file(name, content)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** Ticks of a timer on this thread while a read is running. */
async function ticksDuring(work: Promise<unknown>): Promise<number> {
  let ticks = 0
  const timer = setInterval(() => {
    ticks += 1
  }, 20)
  await work.catch(() => undefined)
  clearInterval(timer)
  return ticks
}

interface EstimateOptions {
  boqRows?: number
  cashflowColumns?: number
  priceRows?: number
  wholeRowMerge?: boolean
}

/** A contractor's estimate as Excel users build one: four sheets, the BOQ on the second. */
async function estimateWorkbook(options: EstimateOptions = {}): Promise<Buffer> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const summary = workbook.addWorksheet('Summary')
  summary.mergeCells('A1:F1')
  summary.getCell('A1').value = 'ABC Contractors - Project Estimate'
  summary.getCell('A3').value = 'Grand total'
  summary.getCell('B3').value = { formula: 'BOQ!F500', result: 12345 }

  const boq = workbook.addWorksheet('BOQ', { views: [{ state: 'frozen', ySplit: 6 }] })
  boq.mergeCells('A1:G1')
  boq.getCell('A1').value = 'BILL OF QUANTITIES'
  boq.getCell('A2').value = 'Project'
  boq.getCell('B2').value = 'Tower 1'
  boq.getRow(6).values = ['ITEM NO.', 'DESCRIPTION', 'QTY', 'UNIT', 'UNIT COST', 'AMOUNT', 'REMARKS']
  boq.getColumn(7).hidden = true
  let rowNumber = 7
  const sections = Math.ceil((options.boqRows ?? 150) / 50)
  for (let section = 0; section < sections; section += 1) {
    boq.mergeCells(`A${rowNumber}:G${rowNumber}`)
    boq.getCell(`A${rowNumber}`).value = `DIVISION ${section + 1} - WORKS`
    rowNumber += 1
    for (let item = 0; item < 49; item += 1) {
      const quantity = 10.5 + item
      boq.getRow(rowNumber).values = [
        `${section + 1}.${item + 1}`,
        `Item ${section}-${item} supply and install`,
        quantity,
        'sqm',
        1234.56,
        { formula: `C${rowNumber}*E${rowNumber}`, result: Math.round(quantity * 123456) / 100 },
        'as per plan',
      ]
      rowNumber += 1
    }
  }
  boq.getCell(`B${rowNumber}`).value = 'GRAND TOTAL'
  boq.getCell(`F${rowNumber}`).value = { formula: `SUM(F7:F${rowNumber - 1})`, result: 999 }
  // Real at runtime, missing from ExcelJS's type declarations.
  const validations = (boq as unknown as { dataValidations: { add(range: string, rule: object): void } })
    .dataValidations
  validations.add(`D7:D${rowNumber}`, { type: 'list', allowBlank: true, formulae: ['"sqm,lm,pcs,lot"'] })
  boq.autoFilter = 'A6:G6'
  boq.pageSetup.printArea = `A1:G${rowNumber}`
  workbook.definedNames.add('BOQ!$A$6:$G$6', 'HeaderRow')

  const rates = workbook.addWorksheet('Rates')
  rates.addRow(['Code', 'Material', 'Unit', 'Price'])
  for (let index = 0; index < (options.priceRows ?? 300); index += 1) {
    rates.addRow([`M${index}`, `Material ${index}`, 'pc', 10 + index])
  }

  const cashflow = workbook.addWorksheet('Cashflow')
  const columns = options.cashflowColumns ?? 20
  cashflow.addRow(Array.from({ length: columns }, (_, index) => `W${index + 1}`))
  cashflow.addRow(Array.from({ length: columns }, (_, index) => index * 1000))
  if (options.wholeRowMerge) cashflow.mergeCells('A5:XFD5')
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

describe('real estimate workbooks', () => {
  it('imports the BOQ sheet of an ordinary multi-sheet estimate', async () => {
    const result = await parseStructuredTakeoff(await estimateWorkbook(), 'estimate.xlsx', MAPPING, { sheet: 'BOQ' })

    expect(result.workbook).toEqual({ sheets: ['Summary', 'BOQ', 'Rates', 'Cashflow'], sheet: 'BOQ' })
    expect(result).toMatchObject({ headerRow: 6, missingColumns: [], sectionRows: 3, skippedRows: 1, warnings: [] })
    expect(result.rows).toHaveLength(147)
    expect(result.rows[0]).toMatchObject({
      sourceRowKey: 'row-8',
      itemNo: '1.1',
      description: 'Item 0-0 supply and install',
      quantity: 10.5,
      unit: 'sqm',
      division: 'DIVISION 1 - WORKS',
      notes: 'as per plan',
      unitRateCentavos: 123_456,
    })
    expect(result.rows.at(-1)).toMatchObject({ itemNo: '3.49', division: 'DIVISION 3 - WORKS' })
  }, SLOW)

  it('judges the sheet being imported, not the other sheets in the workbook (C3-1)', async () => {
    // Each of these refused the whole workbook: an 80-column cash-flow sheet, a
    // 25,001-row price list, and a row merged across the sheet on another tab.
    for (const options of [{ cashflowColumns: 80 }, { priceRows: 25_000 }, { wholeRowMerge: true }]) {
      const result = await parseStructuredTakeoff(await estimateWorkbook(options), 'estimate.xlsx', MAPPING, {
        sheet: 'BOQ',
      })
      expect(result.rows).toHaveLength(147)
    }
    // The limit still holds for the sheet that is imported.
    await expect(
      parseStructuredTakeoff(await estimateWorkbook({ cashflowColumns: 80 }), 'estimate.xlsx', MAPPING, {
        sheet: 'Cashflow',
      }),
    ).rejects.toThrow(
      new TakeoffTooLargeError(
        'The sheet "Cashflow" uses 80 columns; the import reads at most 64. Delete the unused columns (or copy the BOQ to a new sheet) and try again.',
      ),
    )
  }, 3 * SLOW)

  it('fills a text cell merged down a column into every row it spans, never a number (C3-5)', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('BOQ')
    sheet.addRow(['Description', 'Quantity', 'UOM', 'Amount', 'Division', 'Location'])
    sheet.addRow(['Excavation', 10, 'cu.m', 3000, 'Civil', 'Block A'])
    sheet.addRow(['Backfill', 5, 'cu.m', null, null, null])
    sheet.addRow(['Hauling', 5, 'cu.m', null, null, null])
    // Division and Location span the three rows; so does one amount for all of them.
    for (const range of ['D2:D4', 'E2:E4', 'F2:F4']) sheet.mergeCells(range)
    sheet.addRow(['Paint', 2, 'sqm', 100, 'Finishes', null])
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING)

    expect(
      result.rows.map((row) => [row.description, row.division, row.location, row.unitRateCentavos]),
    ).toEqual([
      ['Excavation', 'Civil', 'Block A', 30_000],
      ['Backfill', 'Civil', 'Block A', undefined],
      ['Hauling', 'Civil', 'Block A', undefined],
      ['Paint', 'Finishes', null, 5_000],
    ])
  }, SLOW)

  it('imports hidden rows with a warning and reads the Code and Notes columns (C3-7)', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('BOQ')
    sheet.addRow(['Item No', 'Code', 'Description', 'Quantity', 'UOM', 'Notes'])
    sheet.addRow(['1.1', 'EW-01', 'Excavation', 10, 'cu.m', 'Hand excavation only'])
    sheet.addRow(['1.2', '', 'Backfill detail', 4, 'cu.m', ''])
    sheet.getRow(3).hidden = true
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())

    const result = await parseStructuredTakeoff(buffer, 'boq.xlsx', MAPPING)

    expect(result.rows.map((row) => [row.itemNo, row.code, row.description, row.notes])).toEqual([
      ['1.1', 'EW-01', 'Excavation', 'Hand excavation only'],
      ['1.2', undefined, 'Backfill detail', null],
    ])
    expect(result.warnings).toEqual([
      {
        sourceRowKey: 'row-3',
        code: 'HIDDEN_ROW',
        message: 'This row is hidden in the sheet and was imported. Delete it from the file if it should not count.',
      },
    ])
  }, SLOW)
})

describe('xlsx first filter (round 3 attack files)', () => {
  it('scans unclosed <mergeCell tags in linear time and refuses them (S3-H1)', async () => {
    // 80,000 repeats made the old pattern rescan the part for a minute.
    const unclosed = await xlsx([{ xml: `<sheetData/>${'<mergeCell '.repeat(80_000)}` }])
    const longTag = await xlsx([
      { xml: sheetXml(HEADER, `<mergeCells><mergeCell ${'x'.repeat(300)} ref="A1:B2"/></mergeCells>`) },
    ])

    const started = Date.now()
    expect(() => assertXlsxWithinLimits(unclosed)).toThrow('merged range')
    expect(() => assertXlsxWithinLimits(longTag)).toThrow('merged range')
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('refuses a sheet id or row number ExcelJS would walk as an index range (S3-H2)', async () => {
    const hugeSheetId = await xlsx([{ id: 100_000_000, xml: sheetXml(HEADER + PIPE) }])
    const hugeRow = await xlsx([{ xml: sheetXml(HEADER + PIPE + textRow(100_000_000, ['x', '1', 'm'])) }])

    await expect(parseStructuredTakeoff(hugeSheetId, 'a.xlsx', MAPPING)).rejects.toThrow('sheet id')
    await expect(parseStructuredTakeoff(hugeRow, 'a.xlsx', MAPPING)).rejects.toThrow('row number')
    // A value that is not plain digits is refused too (an entity decodes to digits).
    const encoded = await xlsx([{ xml: sheetXml(HEADER + PIPE) }], {
      'xl/other.xml': '<sheet name="x" sheetId="&#49;00000000"/>',
    })
    expect(() => assertXlsxWithinLimits(encoded)).toThrow('sheet id')
  })

  it('counts merged ranges over the workbook, not per sheet (S3-H2)', async () => {
    // Three sheets of 10,000 single-cell merges passed the per-sheet cap and took 26 s.
    const merges = Array.from({ length: 10_000 }, (_, index) => `<mergeCell ref="A${index + 2}:A${index + 2}"/>`)
    const sheet = { xml: sheetXml(HEADER, `<mergeCells count="10000">${merges.join('')}</mergeCells>`) }

    await expect(parseStructuredTakeoff(await xlsx([sheet, sheet, sheet]), 'a.xlsx', MAPPING)).rejects.toThrow(
      TakeoffTooLargeError,
    )
    const few = { xml: sheetXml(HEADER + PIPE, `<mergeCells count="2">${merges.slice(0, 2).join('')}</mergeCells>`) }
    await expect(parseStructuredTakeoff(await xlsx([few, few]), 'a.xlsx', MAPPING)).resolves.toMatchObject({
      rows: [{ description: 'Pipe' }],
    })
  }, SLOW)

  it('caps the XML ExcelJS expands, in any part, but not images (S3-H3)', async () => {
    // The reviewers' 185 KB file: 60 MB of rich shared strings took a 512 MB heap down.
    const strings = '<si><r><rPr><b/></rPr><t>a</t></r></si>'
    const hungry = await xlsx([{ xml: sheetXml(HEADER + PIPE) }], {
      'xl/sharedStrings.xml': `﻿  <sst ${NS}>${strings.repeat(Math.ceil((60 * 1024 * 1024) / strings.length))}</sst>`,
    })
    const photos = await xlsx([{ xml: sheetXml(HEADER + PIPE) }], {
      'xl/media/image1.png': `\u0089PNG${'\u0000'.repeat(40 * 1024 * 1024)}`,
    })

    expect(() => assertXlsxWithinLimits(hungry)).toThrow(
      new TakeoffTooLargeError(
        'The workbook holds more than 32 MB of sheet data, text and formatting. Copy the BOQ sheet to a new workbook and try again.',
      ),
    )
    expect(() => assertXlsxWithinLimits(photos)).not.toThrow()
  }, SLOW)
})

describe('xlsx reader worker', () => {
  it('reads a rich-text shared string used by every row without rejoining it (S3-H2)', async () => {
    // One shared string of 100,000 runs: the old code joined all of them about
    // 35 times a row (16 s for an 11 KB file).
    const rows = Array.from(
      { length: 300 },
      (_, index) =>
        `<row r="${index + 2}"><c r="A${index + 2}" t="s"><v>0</v></c><c r="B${index + 2}"><v>1</v></c><c r="C${index + 2}" t="inlineStr"><is><t>m</t></is></c></row>`,
    )
    const buffer = await xlsx([{ xml: sheetXml(HEADER + rows.join('')) }], {
      'xl/sharedStrings.xml': `<?xml version="1.0"?><sst ${NS} count="1" uniqueCount="1"><si>${'<r><t>aaaaaaaaaa</t></r>'.repeat(100_000)}</si></sst>`,
    })

    const result = await parseStructuredTakeoff(buffer, 'a.xlsx', MAPPING)

    expect(result.rows).toHaveLength(300)
    expect(result.rows[0]).toMatchObject({ description: 'a'.repeat(1_000), quantity: 1, unit: 'm' })
    expect(result.warnings.filter((warning) => warning.code === 'TEXT_TRUNCATED')).toHaveLength(300)
  }, SLOW)

  it('stops a read at the wall clock and keeps this thread responsive (S3-H2)', async () => {
    // Past the first filter on purpose: whatever it misses must still stop.
    const spinning = await xlsx([{ id: 100_000_000, xml: sheetXml(HEADER + PIPE) }])
    const read = readXlsxSheet(spinning, REQUEST, { ...XLSX_READER_LIMITS, wallClockMs: 3_000 })

    const started = Date.now()
    const ticks = await ticksDuring(read)

    await expect(read).rejects.toThrow(new TakeoffTooLargeError(
      'The workbook took longer than 3 seconds to read. Copy the BOQ sheet to a new workbook and try again.',
    ))
    expect(Date.now() - started).toBeLessThan(10_000)
    // A blocked thread would not have run its timer; 3 s is 150 ticks.
    expect(ticks).toBeGreaterThan(50)
  }, SLOW)

  it('stops a read at the heap cap instead of taking the process down (S3-H3)', async () => {
    // 30 MB of rich shared strings in a 90 KB file; ExcelJS holds about 12x.
    const strings = '<si><r><rPr><b/></rPr><t>a</t></r></si>'
    const hungry = await xlsx([{ xml: sheetXml(HEADER + PIPE) }], {
      'xl/sharedStrings.xml': `<?xml version="1.0"?><sst ${NS}>${strings.repeat(Math.ceil((30 * 1024 * 1024) / strings.length))}</sst>`,
    })
    expect(() => assertXlsxWithinLimits(hungry)).not.toThrow()

    await expect(
      readXlsxSheet(hungry, REQUEST, { ...XLSX_READER_LIMITS, heapMb: 96, wallClockMs: SLOW }),
    ).rejects.toThrow(
      new TakeoffTooLargeError(
        'The workbook needs more than 96 MB of memory to read. Copy the BOQ sheet to a new workbook and try again.',
      ),
    )
    // The limits are released: an ordinary workbook reads right after.
    await expect(
      parseStructuredTakeoff(await xlsx([{ xml: sheetXml(HEADER + PIPE) }]), 'a.xlsx', MAPPING),
    ).resolves.toMatchObject({ rows: [{ description: 'Pipe', quantity: 3, unit: 'm' }] })
  }, SLOW)

  it('refuses a read while the allowed number are running, then frees the slot', async () => {
    const limits = { ...XLSX_READER_LIMITS, concurrent: 1, wallClockMs: 2_000 }
    const spinning = await xlsx([{ id: 100_000_000, xml: sheetXml(HEADER + PIPE) }])
    const ordinary = await xlsx([{ xml: sheetXml(HEADER + PIPE) }])

    const first = readXlsxSheet(spinning, REQUEST, limits)
    await expect(readXlsxSheet(ordinary, REQUEST, limits)).rejects.toBeInstanceOf(TakeoffBusyError)
    await expect(first).rejects.toBeInstanceOf(TakeoffTooLargeError)
    await expect(readXlsxSheet(ordinary, REQUEST, limits)).resolves.toMatchObject({ sheets: ['S1'], sheet: 'S1' })
  }, SLOW)

  it('reports a workbook ExcelJS cannot read as an error, not a hang', async () => {
    const broken = await xlsx([{ xml: '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></row>' }])

    await expect(readXlsxSheet(broken, REQUEST)).rejects.toThrow('The workbook could not be read')
  }, SLOW)
})
