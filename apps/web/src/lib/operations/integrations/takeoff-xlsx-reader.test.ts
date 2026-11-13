// Round 3 and 4 security reviews: every attack file the reviewers ran is built
// here and must be refused by the first filter or stopped by the reader's
// limits, with the server process still responsive. Real workbooks must still import.
import type { ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import {
  assertXlsxWithinLimits,
  parseStructuredTakeoff,
  TakeoffBusyError,
  TakeoffTooLargeError,
  XLSX_LIMITS,
} from './takeoff'
import { readXlsxSheet, XLSX_READER_LIMITS, type XlsxSheetRequest } from './takeoff-xlsx-reader'

// fork as the reader calls it, except that a test can make the next calls
// throw (a spawn that fails synchronously) or return a child that only emits
// 'error' (a spawn that fails after fork returned), and see each child it started.
const spawn = vi.hoisted(() => ({ failNext: 0, failAsyncNext: 0, children: [] as ChildProcess[] }))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  const { EventEmitter } = await import('node:events')
  return {
    ...actual,
    fork: (...args: Parameters<typeof actual.fork>) => {
      if (spawn.failNext > 0) {
        spawn.failNext -= 1
        throw new Error('spawn EAGAIN')
      }
      if (spawn.failAsyncNext > 0) {
        spawn.failAsyncNext -= 1
        // No pid, and no 'close' after the 'error': only the error handler can free the slot.
        const child = Object.assign(new EventEmitter(), { pid: undefined, stderr: null, kill: () => false, send: () => true })
        process.nextTick(() => child.emit('error', new Error('spawn ENOENT')))
        return child as unknown as ChildProcess
      }
      const child = actual.fork(...args)
      spawn.children.push(child)
      return child
    },
  }
})

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

  it('counts a scanned part toward the XML budget even when it does not start like XML (S5-3)', async () => {
    // The reviewers' part: text first, then sheet content the tag scans read.
    const part = `x sheetData ${`<${'a'.repeat(32)} `.repeat(100)}`
    const file = await xlsx([{ xml: sheetXml(HEADER + PIPE) }], { 'xl/worksheets/sheet9.xml': part })
    // Room for every other part, but not for this one as well.
    const xmlBytes = Buffer.byteLength(sheetXml(HEADER + PIPE)) + part.length

    expect(() => assertXlsxWithinLimits(file, { ...XLSX_LIMITS, xmlBytes })).toThrow(TakeoffTooLargeError)
  })
})

describe('xlsx first filter (round 4: every index ExcelJS allocates from)', () => {
  // Distinct attributes, so the tag is well-formed XML: about 2 KB before r
  // (50 of them: a tag past 64 attributes is refused, see S1 below).
  const padding = Array.from({ length: 50 }, (_, index) => `a${index}="${'0'.repeat(32)}"`).join(' ')
  const sheetWith = (rows: string, after = '') => xlsx([{ xml: sheetXml(HEADER + rows, after) }])

  it('reads a row number however far into the tag it is (S4-1)', async () => {
    // The old scan looked 512 characters into a <row> tag; this r was never checked.
    const padded = await sheetWith(`<row ${padding} r="4000000000"><c r="A3"><v>1</v></c></row>`)
    expect(() => assertXlsxWithinLimits(padded)).toThrow('row number')
    await expect(parseStructuredTakeoff(padded, 'a.xlsx', MAPPING)).rejects.toThrow('row number')

    // The same padding on a row inside the sheet is an ordinary row.
    const ordinary = await sheetWith(`<row ${padding} r="2"><c r="A2" t="inlineStr"><is><t>Pipe</t></is></c><c r="B2"><v>3</v></c><c r="C2" t="inlineStr"><is><t>m</t></is></c></row>`)
    await expect(parseStructuredTakeoff(ordinary, 'a.xlsx', MAPPING)).resolves.toMatchObject({
      rows: [{ description: 'Pipe', quantity: 3, unit: 'm' }],
    })
  }, SLOW)

  it('refuses a row whose number it cannot read', async () => {
    for (const row of [
      '<row><c r="A2"><v>1</v></c></row>', // ExcelJS cannot place it either
      '<row r="2" r="4000000000"></row>',
      '<row r="2abc"></row>', // parseInt would read 2
      '<row r="&#52;000000000"></row>', // an entity decodes to digits
      '<row r="0"></row>',
      `<row a="x>" r="4000000000"></row>`, // the > ends what the scan can read
    ]) {
      const file = await sheetWith(row)
      expect(() => assertXlsxWithinLimits(file), row).toThrow('row number')
    }
  })

  it('refuses a cell reference, column range, dimension or merged range outside the sheet (S4-1)', async () => {
    const refused: Array<[string, Promise<Buffer>]> = [
      ['cell reference', sheetWith('<row r="2"><c r="A2000000"><v>1</v></c></row>')],
      ['cell reference', sheetWith('<row r="2"><c r="XFE2"><v>1</v></c></row>')],
      ['cell reference', sheetWith(`<row r="2"><c ${padding} r="a2"><v>1</v></c></row>`)],
      ['column range', xlsx([{ xml: `<worksheet ${NS}><cols><col min="1" max="4000000000"/></cols><sheetData>${HEADER}</sheetData></worksheet>` }])],
      ['column range', xlsx([{ xml: `<worksheet ${NS}><cols><col min="1"/></cols><sheetData>${HEADER}</sheetData></worksheet>` }])],
      ['sheet dimension', xlsx([{ xml: `<worksheet ${NS}><dimension ref="A1:A4000000000"/><sheetData>${HEADER}</sheetData></worksheet>` }])],
      ['sheet dimension', xlsx([{ xml: `<worksheet ${NS}><dimension ${padding} ref="A1:ZZZ1"/><sheetData>${HEADER}</sheetData></worksheet>` }])],
      ['merged range', sheetWith(PIPE, '<mergeCells count="1"><mergeCell ref="A2:A2000000"/></mergeCells>')],
      ['merged range', sheetWith(PIPE, '<mergeCells count="1"><mergeCell ref="XFE1:XFE1"/></mergeCells>')],
    ]
    for (const [reason, file] of refused) {
      const buffer = await file
      expect(() => assertXlsxWithinLimits(buffer), reason).toThrow(reason)
    }

    // What Excel writes is inside the sheet, up to its last row and column.
    const edges = await xlsx([
      {
        xml: `<worksheet ${NS}><dimension ref="A1:XFD1048576"/><cols><col min="1" max="16384" width="9"/></cols><sheetData>${HEADER}${PIPE}<row r="1048576"><c r="XFD1048576"><v>1</v></c></row></sheetData></worksheet>`,
      },
    ])
    expect(() => assertXlsxWithinLimits(edges)).not.toThrow()
  })

  it('counts the columns ExcelJS creates up to the last cell of a sheet', async () => {
    // 50 sheets with one cell in column XFD: 16,384 columns each, 819,200 in all.
    const far = { xml: sheetXml(HEADER + '<row r="2"><c r="XFD2"><v>1</v></c></row>') }
    const wide = await xlsx(Array.from({ length: 50 }, () => far))
    expect(() => assertXlsxWithinLimits(wide)).toThrow(TakeoffTooLargeError)
  })

  it('reads a sheet id however long its value is (S4-1)', async () => {
    // 40 characters: the old 32-character window skipped the check.
    const padded = await xlsx([{ xml: sheetXml(HEADER + PIPE) }], {
      'xl/other.xml': `<sheet name="x" sheetId="${'0'.repeat(31)}100000000"/>`,
    })
    expect(() => assertXlsxWithinLimits(padded)).toThrow('sheet id')
  })

  it('reads every attribute of a tag, so a decoy inside a value cannot hide the real one (S5-2)', async () => {
    // saxes reads x=" r='3' >" and then r="4000000000"; the scan used to stop at
    // the > inside x and read the decoy r instead.
    const refused: Array<[string, Promise<Buffer>]> = [
      ['row number', sheetWith(`<row x=" r='2' >" r="4000000000"><c r="A2"><v>1</v></c></row>`)],
      ['row number', sheetWith(`<row x=" r='3' >" r="4000000000"><c r="A3" t="inlineStr"><is><t>x</t></is></c></row>`)],
      ['merged range', sheetWith(PIPE, `<mergeCells count="1"><mergeCell x=" ref='A1:A2' >" ref="A1:XFD1048576"/></mergeCells>`)],
      ['cell reference', sheetWith(`<row r="2"><c x="a>" r="XFD2"><v>1</v></c></row>`)],
      ['cell reference', sheetWith(`<row r="2"><c x=">" r="XFD2"><v>1</v></c></row>`)],
      ['column range', xlsx([{ xml: `<worksheet ${NS}><cols><col x=" min='1' max='2' >" min="1" max="4000000000"/></cols><sheetData>${HEADER}</sheetData></worksheet>` }])],
      ['sheet dimension', xlsx([{ xml: `<worksheet ${NS}><dimension x=" ref='A1' >" ref="A1:A4000000000"/><sheetData>${HEADER}</sheetData></worksheet>` }])],
      // A tag not consumed exactly: a stray quote, text between attributes, a missing =.
      ['row number', sheetWith(`<row r="2" x="a></row>`)],
      ['row number', sheetWith(`<row r="2" junk></row>`)],
      ['row number', sheetWith(`<row r="2"x="1"></row>`)],
      ['cell reference', sheetWith(`<row r="2"><c r="A2" '><v>1</v></c></row>`)],
    ]
    for (const [reason, file] of refused) {
      const buffer = await file
      expect(() => assertXlsxWithinLimits(buffer), reason).toThrow(reason)
    }

    // An escaped > is an ordinary value, and the row imports.
    const escaped = await sheetWith(
      `<row x="a&gt;b" r="2" spans="1:3" x14ac:dyDescent="0.25"><c r="A2" s="1" t="inlineStr"><is><t>Pipe</t></is></c><c r="B2"><v>3</v></c><c r="C2" t="inlineStr"><is><t>m</t></is></c></row>`,
    )
    await expect(parseStructuredTakeoff(escaped, 'a.xlsx', MAPPING)).resolves.toMatchObject({
      rows: [{ description: 'Pipe', quantity: 3, unit: 'm' }],
    })
  }, SLOW)

  it('scans unclosed row and cell tags in linear time and refuses them', async () => {
    const rows = await xlsx([{ xml: `<worksheet ${NS}><sheetData>${'<row r="1" '.repeat(200_000)}` }])
    const cells = await xlsx([{ xml: `<worksheet ${NS}><sheetData><row r="1">${'<c r="A1" '.repeat(200_000)}` }])

    const started = Date.now()
    expect(() => assertXlsxWithinLimits(rows)).toThrow('row number')
    expect(() => assertXlsxWithinLimits(cells)).toThrow('cell reference')
    expect(Date.now() - started).toBeLessThan(2_000)
  }, SLOW)
})

describe('xlsx first filter (round 6: XML 1.1 white space)', () => {
  // saxes reads these two as white space once a part declares XML 1.1.
  const NEL = '\u0085'
  const LS = ' '
  const V11 = '<?xml version="1.1" encoding="UTF-8"?>'
  const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const sheetPart = (declaration: string, rows: string, after = '') =>
    xlsx([{ xml: `${declaration}<worksheet ${NS}><sheetData>${rows}</sheetData>${after}</worksheet>` }])
  const workbookPart = (declaration: string, sheet: string) =>
    xlsx([{ xml: sheetXml(HEADER + PIPE) }], {
      'xl/workbook.xml': `${declaration}<workbook ${NS} ${R}><sheets>${sheet}</sheets></workbook>`,
    })
  const merge = (tag: string) => `<mergeCells count="1">${tag}</mergeCells>`
  // The reviewers' files: [what the tag reader must say, the part given its XML declaration].
  const hidden: Array<[string, (declaration: string) => Promise<Buffer>]> = [
    ['row number', (xml) => sheetPart(xml, `${HEADER}<row${NEL}r="4000000000"><c r="A1"/></row>`)],
    ['row number', (xml) => sheetPart(xml, `${HEADER}<row${LS}r="4000000000"><c r="A1"/></row>`)],
    ['merged range', (xml) => sheetPart(xml, HEADER + PIPE, merge(`<mergeCell${NEL}ref="A1:XFD1048576"/>`))],
    ['merged range', (xml) => sheetPart(xml, HEADER + PIPE, merge(`<mergeCell${LS}ref="A1:XFD1048576"/>`))],
    ['cell reference', (xml) => sheetPart(xml, `${HEADER}<row r="2"><c${NEL}r="XFD2"><v>1</v></c></row>`)],
    ['cell reference', (xml) => sheetPart(xml, `${HEADER}<row r="2"><c ${NEL}r="XFD2"><v>1</v></c></row>`)],
    ['cell reference', (xml) => sheetPart(xml, `${HEADER}<row r="2"><c\r${NEL}r="XFD2"><v>1</v></c></row>`)],
    ['cell reference', (xml) => sheetPart(xml, `${HEADER}<row r="2"><c ${LS}r="XFD2"><v>1</v></c></row>`)],
    ['sheet id', (xml) => workbookPart(xml, `<sheet name="S1" sheetId${NEL}="4000000000" r:id="rId1"/>`)],
    ['sheet id', (xml) => workbookPart(xml, `<sheet name="S1" sheetId${LS}="4000000000" r:id="rId1"/>`)],
    ['sheet id', (xml) => workbookPart(xml, `<sheet name="S1" sheetId=${NEL}"4000000000" r:id="rId1"/>`)],
  ]

  it('refuses a part that declares any XML version but 1.0 (B1)', async () => {
    for (const [reason, file] of hidden) {
      const buffer = await file(V11)
      expect(() => assertXlsxWithinLimits(buffer), reason).toThrow('not plain XML 1.0')
    }
    const refused = [
      // No hidden index at all: the version alone is refused.
      await sheetPart(V11, HEADER + PIPE),
      await sheetPart('<?xml version="1.2"?>', HEADER + PIPE),
      await sheetPart('<?xml version="1.00"?>', HEADER + PIPE),
      // saxes takes the last version it reads, wherever the declaration is.
      await sheetPart('<?xml version="1.0" version="1.1"?>', HEADER + PIPE),
      await sheetPart('<?xml version="1.0"?>', `${HEADER}<?xml version="1.1"?>${PIPE}`),
      await sheetPart(`<?xml${NEL}version="1.1"?>`, HEADER + PIPE),
      await workbookPart(V11, '<sheet name="S1" sheetId="1" r:id="rId1"/>'),
    ]
    for (const [index, buffer] of refused.entries()) {
      expect(() => assertXlsxWithinLimits(buffer), `file ${index}`).toThrow('not plain XML 1.0')
    }
    await expect(parseStructuredTakeoff(await sheetPart(V11, HEADER + PIPE), 'a.xlsx', MAPPING)).rejects.toThrow(
      'not plain XML 1.0',
    )

    // What spreadsheet writers emit, in either quote style, is XML 1.0.
    for (const declaration of [
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      "<?xml version='1.0' encoding='utf-8' standalone='no' ?>",
      '<?xml version="1.0"?>',
      '',
    ]) {
      const buffer = await sheetPart(declaration, HEADER + PIPE)
      expect(() => assertXlsxWithinLimits(buffer), declaration).not.toThrow()
    }
  })

  it('reads a name to its last ASCII character, so nothing after it hides an index (S6-1)', async () => {
    // The same tags with no XML 1.1 declaration: the tag reader refuses each on
    // its own, whatever a parser makes of the character after the name.
    for (const [reason, file] of hidden) {
      for (const declaration of ['', '<?xml version="1.0"?>']) {
        const buffer = await file(declaration)
        expect(() => assertXlsxWithinLimits(buffer), reason).toThrow(reason)
      }
    }
    // A sheetId is read wherever it stands and must be an attribute with a quoted number.
    for (const sheet of [
      '<sheet name="S1" sheetId=4000000000 r:id="rId1"/>',
      '<sheet name="S1" sheetId \n=\t "4000000000" r:id="rId1"/>',
      `<sheet name="sheetId='" sheetId="4000000000" r:id="rId1" x="'"/>`,
      '<sheet name="S1" sheetId r:id="rId1"/>',
    ]) {
      const buffer = await workbookPart('<?xml version="1.0"?>', sheet)
      expect(() => assertXlsxWithinLimits(buffer), sheet).toThrow('sheet id')
    }
    const spaced = await workbookPart('<?xml version="1.0"?>', `<sheet name="S1" sheetId \n=\t '65535' r:id="rId1"/>`)
    expect(() => assertXlsxWithinLimits(spaced)).not.toThrow()
  })

  it('imports an XML 1.0 sheet whose cell text holds U+0085 or U+2028', async () => {
    // In text the two characters are ordinary; Excel's own attribute names stay readable.
    const row = textRow(2, [`Pipe${NEL}2 in${LS}PVC`, '3', 'm']).replace(
      '<row r="2">',
      '<row r="2" spans="1:3" x14ac:dyDescent="0.25" xr:uid="{00000000-0001-0000-0000-000000000000}">',
    )
    const sheet = await sheetPart('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', HEADER + row)

    await expect(parseStructuredTakeoff(sheet, 'a.xlsx', MAPPING)).resolves.toMatchObject({
      rows: [{ description: `Pipe${NEL}2 in${LS}PVC`, quantity: 3, unit: 'm' }],
    })
  }, SLOW)
})

describe('xlsx first filter (round 6: work on the request thread)', () => {
  it('refuses a tag past 64 attributes instead of holding every one of them (S1)', async () => {
    // The reviewers' part: one <row> tag of 3.9 million attributes, 30 MB that
    // deflate to under 50 KB. Reading them all took 1.5 s and 420 MB of heap.
    const attribute = ' ab="12"'
    const endless = await xlsx([
      {
        xml: `<?xml version="1.0"?><worksheet ${NS}><sheetData><row r="1"${attribute.repeat((30 * 1024 * 1024) / attribute.length)}/></sheetData></worksheet>`,
      },
    ])
    expect(endless.length).toBeLessThan(100_000)

    const started = performance.now()
    expect(() => assertXlsxWithinLimits(endless)).toThrow('row number')
    expect(performance.now() - started).toBeLessThan(1_000)

    // 64 attributes, the row number last, are still read; the 65th refuses the tag.
    const rowOf = (extra: number) =>
      xlsx([
        {
          xml: sheetXml(
            `${HEADER}<row${Array.from({ length: extra }, (_, index) => ` a${index}="1"`).join('')} r="2"><c r="A2"><v>1</v></c></row>`,
          ),
        },
      ])
    const widest = await rowOf(63)
    const tooWide = await rowOf(64)
    expect(() => assertXlsxWithinLimits(widest)).not.toThrow()
    expect(() => assertXlsxWithinLimits(tooWide)).toThrow('row number')
  }, SLOW)

  it('counts <col> and <dimension> tags, so a part full of them ends the scan at the limit (S6-4)', async () => {
    // The reviewers' parts: 31.5 MB of one tag in an 80 KB upload. Each tag
    // counted as nothing, so all 1.5 million were read (1.3 s and 1.7 s).
    const full = (tag: string) =>
      xlsx([
        {
          xml: `<?xml version="1.0"?><worksheet ${NS}><sheetData/>${tag.repeat(Math.floor((31.5 * 1024 * 1024) / tag.length))}</worksheet>`,
        },
      ])
    const tooMany = new TakeoffTooLargeError(
      'The workbook holds more than 500,000 rows and cells over all its sheets (a merged range counts every cell it covers). Copy the BOQ sheet to a new workbook and try again.',
    )

    for (const tag of ['<col min="1" max="1"/>', '<dimension ref="A1"/>']) {
      const file = await full(tag)
      expect(file.length).toBeLessThan(200_000)
      const started = performance.now()
      // Refused at tag 500,001 of 1.5 million, so about a third of the part is read.
      expect(() => assertXlsxWithinLimits(file), tag).toThrow(tooMany)
      expect(performance.now() - started, tag).toBeLessThan(2_000)
    }
  }, SLOW)
})

describe('xlsx first filter (round 6: a sheet list ExcelJS searches for every part, S6-2)', () => {
  const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const listing = (sheets: number, parts: Record<string, string> = {}) =>
    xlsx([{ xml: sheetXml(HEADER + PIPE) }], {
      ...parts,
      'xl/workbook.xml': `<?xml version="1.0"?><workbook ${NS} ${R}><sheets><sheet name="S1" sheetId="1" r:id="rId1"/>${'<sheet name="s" sheetId="2" r:id="x"/>'.repeat(sheets - 1)}</sheets></workbook>`,
    })
  const tooManySheets = new TakeoffTooLargeError(
    'The workbook lists more than 1,000 sheets, counting those of linked workbooks. Copy the BOQ sheet to a new workbook and try again.',
  )

  it('refuses a workbook that lists more than 1,000 sheets or holds more than 1,000 parts', async () => {
    // The reviewers' file: 800,000 sheet entries and 4,900 empty worksheet parts,
    // 1.1 MB on disk, inside every earlier limit. ExcelJS searched the list once
    // for each part and the reader ran to its 15 s kill.
    const emptySheets = Object.fromEntries(
      Array.from({ length: 4_899 }, (_, index) => [`xl/worksheets/sheet${index + 2}.xml`, `<worksheet ${NS}><sheetData/></worksheet>`]),
    )
    const storm = await listing(800_000, emptySheets)
    expect(() => assertXlsxWithinLimits(storm)).toThrow(
      new TakeoffTooLargeError('The workbook has more than 1,000 parts. Copy the BOQ to a new workbook and try again.'),
    )

    // The list alone, with few parts: the scan stops at entry 1,001.
    const longList = await listing(800_000)
    const started = performance.now()
    expect(() => assertXlsxWithinLimits(longList)).toThrow(tooManySheets)
    expect(performance.now() - started).toBeLessThan(1_000)

    expect(() => assertXlsxWithinLimits(longList, { ...XLSX_LIMITS, sheetIds: 800_000 })).not.toThrow()
    const oneOver = await listing(1_001)
    const atTheLimit = await listing(1_000)
    expect(() => assertXlsxWithinLimits(oneOver)).toThrow(tooManySheets)
    expect(() => assertXlsxWithinLimits(atTheLimit)).not.toThrow()
    await expect(parseStructuredTakeoff(atTheLimit, 'a.xlsx', MAPPING)).resolves.toMatchObject({
      rows: [{ description: 'Pipe', quantity: 3, unit: 'm' }],
    })
  }, SLOW)
})

describe('xlsx first filter (round 6: only the tags ExcelJS acts on)', () => {
  const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const XDR = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"'
  const X = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
  const anchor = (from: string, to: string) =>
    `<anchor moveWithCells="1"><from>${from}</from><to>${to}</to></anchor>`
  const corner = (column: number, row: number) =>
    `<xdr:col>${column}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff>`

  it('imports a sheet with a form control or an embedded object (S2)', async () => {
    // Excel writes the anchor of a check box or an embedded PDF inside the sheet
    // part, as <xdr:col> and <xdr:row>; the scan read both as index tags.
    const controls = `<controls><control shapeId="1025" r:id="rId3" name="Check Box 1"><controlPr defaultSize="0" autoFill="0" autoLine="0" autoPict="0">${anchor(corner(4, 1), corner(5, 2))}</controlPr></control></controls>`
    const objects = `<oleObjects><oleObject progId="Acrobat.Document.DC" shapeId="1026" r:id="rId4"><objectPr defaultSize="0" r:id="rId5">${anchor(corner(6, 3), corner(7, 6))}</objectPr></oleObject></oleObjects>`
    const file = await xlsx([
      {
        xml: `<?xml version="1.0" encoding="UTF-8"?><worksheet ${NS} ${R} ${XDR}><sheetData>${HEADER}${PIPE}</sheetData>${objects}${controls}</worksheet>`,
      },
    ])

    await expect(parseStructuredTakeoff(file, 'a.xlsx', MAPPING)).resolves.toMatchObject({
      rows: [{ description: 'Pipe', quantity: 3, unit: 'm' }],
    })
  }, SLOW)

  it('leaves prefixed tags to a reader that does not act on them (S2)', async () => {
    // The indexes that made ExcelJS spin or fill memory, on prefixed tags beside
    // two real rows. ExcelJS matches the unprefixed name only, so through the
    // real reader process nothing here is walked: it answers well inside 5 s
    // with the real rows and no others.
    const file = await xlsx([
      {
        xml: `<?xml version="1.0"?><worksheet ${NS} ${X} ${XDR}><sheetData>${HEADER}${PIPE}<x:row r="4000000000"><x:c r="XFD4000000000"/></x:row></sheetData><xdr:row r="4000000000"/><x:mergeCells><x:mergeCell ref="A1:XFD1048576"/></x:mergeCells><x:cols><x:col min="1" max="4000000000"/></x:cols></worksheet>`,
      },
    ])

    await expect(readXlsxSheet(file, REQUEST, { ...XLSX_READER_LIMITS, wallClockMs: 5_000 })).resolves.toEqual({
      sheets: ['S1'],
      sheet: 'S1',
      grid: [
        ['Description', 'Quantity', 'UOM'],
        ['Pipe', '3', 'm'],
      ],
      hiddenRows: [],
    })
    expect(() => assertXlsxWithinLimits(file)).not.toThrow()
    await expect(parseStructuredTakeoff(file, 'a.xlsx', MAPPING)).resolves.toMatchObject({
      rows: [{ description: 'Pipe', quantity: 3, unit: 'm' }],
    })
    // The unprefixed tags, which ExcelJS does act on, are still read and refused.
    const unprefixed = await xlsx([{ xml: sheetXml(`${HEADER}<row r="4000000000"><c r="A4"><v>1</v></c></row>`) }])
    expect(() => assertXlsxWithinLimits(unprefixed)).toThrow('row number')
  }, SLOW)
})

describe('xlsx reader process', () => {
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

  it('stops at 1,001 runs of a rich-text string whose runs are all empty (S6-2)', async () => {
    // The reviewers' 44 KB file: one shared string of 1,000,000 empty runs, used
    // by 6,000 cells. Empty runs never reach the text cut, so every cell walked
    // all of them and the reader ran to its 15 s kill.
    const rows = Array.from({ length: 2_000 }, (_, index) => {
      const row = index + 2
      return `<row r="${row}"><c r="A${row}" t="s"><v>0</v></c><c r="B${row}" t="s"><v>0</v></c><c r="C${row}" t="s"><v>0</v></c></row>`
    })
    const buffer = await xlsx([{ xml: sheetXml(HEADER + rows.join('') + textRow(2_002, ['Pipe', '3', 'm'])) }], {
      'xl/sharedStrings.xml': `<?xml version="1.0"?><sst ${NS}><si>${'<r><t/></r>'.repeat(1_000_000)}</si></sst>`,
    })
    expect(buffer.length).toBeLessThan(100_000)
    expect(() => assertXlsxWithinLimits(buffer)).not.toThrow()

    // Inside a 5 second clock, not the 15 seconds a read may take.
    const read = await readXlsxSheet(buffer, REQUEST, { ...XLSX_READER_LIMITS, wallClockMs: 5_000 })

    expect(read).toMatchObject({ sheet: 'S1', hiddenRows: [] })
    const grid = 'grid' in read ? read.grid : []
    expect(grid).toHaveLength(2_002)
    expect(grid[1]).toEqual(['', '', ''])
    expect(grid[2_001]).toEqual(['Pipe', '3', 'm'])
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
    // The slot is free: a read with its own (default) wall clock, still one at a time.
    await expect(readXlsxSheet(ordinary, REQUEST, { ...XLSX_READER_LIMITS, concurrent: 1 })).resolves.toMatchObject({
      sheets: ['S1'],
      sheet: 'S1',
    })
  }, SLOW)

  it('runs one read at a time for a tenant and leaves the other slot to another tenant (S6-2)', async () => {
    // Past the first filter on purpose: whatever shape keeps a reader busy for
    // its whole clock, one tenant holds one slot with it, not both.
    const limits = { ...XLSX_READER_LIMITS, wallClockMs: 3_000 }
    const spinning = await xlsx([
      { xml: sheetXml(`${HEADER}<row r="4000000000"><c r="A4"><v>1</v></c></row>`) },
    ])
    const ordinary = await xlsx([{ xml: sheetXml(HEADER + PIPE) }])

    const first = readXlsxSheet(spinning, REQUEST, limits, 'tenant-a')
    // One slot of the two is still free, but not for the tenant that holds the other.
    await expect(readXlsxSheet(spinning, REQUEST, limits, 'tenant-a')).rejects.toBeInstanceOf(TakeoffBusyError)
    await expect(readXlsxSheet(ordinary, REQUEST, limits, 'tenant-a')).rejects.toBeInstanceOf(TakeoffBusyError)
    const other = readXlsxSheet(ordinary, REQUEST, XLSX_READER_LIMITS, 'tenant-b')
    // Both slots are taken now, whoever asks.
    await expect(readXlsxSheet(ordinary, REQUEST, limits, 'tenant-c')).rejects.toBeInstanceOf(TakeoffBusyError)

    await expect(other).resolves.toMatchObject({ sheets: ['S1'], sheet: 'S1' })
    await expect(first).rejects.toBeInstanceOf(TakeoffTooLargeError)
    // Its read is over, so the first tenant may read again.
    await expect(readXlsxSheet(ordinary, REQUEST, XLSX_READER_LIMITS, 'tenant-a')).resolves.toMatchObject({
      sheet: 'S1',
    })
  }, SLOW)

  it('reports a workbook ExcelJS cannot read as an error, not a hang', async () => {
    const broken = await xlsx([{ xml: '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></row>' }])

    await expect(readXlsxSheet(broken, REQUEST)).rejects.toThrow('The workbook could not be read')
  }, SLOW)

  it('kills a spinning reader at the wall clock and frees its slot once it is gone (S4-1)', async () => {
    // The reviewers' file, past the first filter on purpose: ExcelJS walks a
    // sparse array of 4,000,000,000 rows inside a V8 builtin no thread can stop.
    const limits = { ...XLSX_READER_LIMITS, concurrent: 1, wallClockMs: 2_000 }
    const spinning = await xlsx([
      { xml: sheetXml(`${HEADER}<row r="4000000000"><c r="A4"><v>1</v></c></row>`) },
    ])
    const ordinary = await xlsx([{ xml: sheetXml(HEADER + PIPE) }])

    const read = readXlsxSheet(spinning, REQUEST, limits)
    const child = spawn.children.at(-1)
    await expect(read).rejects.toThrow(
      new TakeoffTooLargeError(
        'The workbook took longer than 2 seconds to read. Copy the BOQ sheet to a new workbook and try again.',
      ),
    )
    // Settled only after the process ended on SIGKILL, so no core is left spinning.
    expect(child?.signalCode).toBe('SIGKILL')
    expect(child?.exitCode).toBeNull()
    await expect(readXlsxSheet(ordinary, REQUEST, { ...XLSX_READER_LIMITS, concurrent: 1 })).resolves.toMatchObject({
      sheet: 'S1',
    })
  }, SLOW)

  it('frees the slot when the reader process fails to start (S4-1)', async () => {
    // Three spawns that throw used to leave the next valid read answered 503.
    const ordinary = await xlsx([{ xml: sheetXml(HEADER + PIPE) }])
    spawn.failNext = 3
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(readXlsxSheet(ordinary, REQUEST)).rejects.toThrow('spawn EAGAIN')
    }

    await expect(readXlsxSheet(ordinary, REQUEST)).resolves.toMatchObject({ sheets: ['S1'], sheet: 'S1' })
  }, SLOW)

  it('frees the slot when the reader process fails after fork returned (N3)', async () => {
    // An async spawn error: 'error' with no pid, and here no 'close' to fall back on.
    const limits = { ...XLSX_READER_LIMITS, concurrent: 1 }
    const ordinary = await xlsx([{ xml: sheetXml(HEADER + PIPE) }])
    spawn.failAsyncNext = 1

    await expect(readXlsxSheet(ordinary, REQUEST, limits)).rejects.toThrow('spawn ENOENT')
    await expect(readXlsxSheet(ordinary, REQUEST, limits)).resolves.toMatchObject({ sheets: ['S1'], sheet: 'S1' })
  }, SLOW)
})
