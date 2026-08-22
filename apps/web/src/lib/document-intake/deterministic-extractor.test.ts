import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock('@third-code-erp/auth/server', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

import {
  DETERMINISTIC_EXTRACTOR_VERSION,
  csvToText,
  extractDeterministicDocument,
} from './deterministic-extractor'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const STORAGE_PATH = `${TENANT_ID}/33333333-3333-4333-8333-333333333333/schedule.csv`

function sourceHash(source: string): string {
  return createHash('sha256').update(Buffer.from(source)).digest('hex')
}

function blobFromBuffer(buffer: Buffer): Blob {
  const bytes = Uint8Array.from(buffer)
  return new Blob([bytes.buffer])
}

function simplePdf(text: string): Buffer {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${text}) Tj\nET\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf)
}

function bitmapWithText(text: string): Buffer {
  const glyphs: Record<string, string[]> = {
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
    S: ['01111', '10000', '01110', '00001', '00001', '00001', '11110'],
  }
  const scale = 16
  const margin = 24
  const glyphWidth = 5 * scale
  const glyphHeight = 7 * scale
  const width = margin * 2 + text.length * glyphWidth + (text.length - 1) * scale
  const height = margin * 2 + glyphHeight
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixels = Buffer.alloc(rowSize * height, 255)

  for (let characterIndex = 0; characterIndex < text.length; characterIndex += 1) {
    const glyph = glyphs[text[characterIndex] ?? '']
    if (!glyph) throw new Error(`No bitmap glyph for ${text[characterIndex]}`)
    for (let y = 0; y < glyph.length; y += 1) {
      for (let x = 0; x < glyph[y]!.length; x += 1) {
        if (glyph[y]![x] !== '1') continue
        for (let scaleY = 0; scaleY < scale; scaleY += 1) {
          for (let scaleX = 0; scaleX < scale; scaleX += 1) {
            const imageX =
              margin + characterIndex * (glyphWidth + scale) + x * scale + scaleX
            const imageY = margin + y * scale + scaleY
            const row = height - 1 - imageY
            const offset = row * rowSize + imageX * 3
            pixels[offset] = 0
            pixels[offset + 1] = 0
            pixels[offset + 2] = 0
          }
        }
      }
    }
  }

  const header = Buffer.alloc(54)
  header.write('BM', 0, 'ascii')
  header.writeUInt32LE(54 + pixels.length, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(pixels.length, 34)
  return Buffer.concat([header, pixels])
}

function imageOnlyPdfWithText(text: string): Buffer {
  const glyphs: Record<string, string[]> = {
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    E: ['11111', '10000', '11110', '10000', '10000', '10000', '11111'],
    S: ['01111', '10000', '01110', '00001', '00001', '00001', '11110'],
  }
  const scale = 16
  const margin = 24
  const glyphWidth = 5 * scale
  const glyphHeight = 7 * scale
  const width = margin * 2 + text.length * glyphWidth + (text.length - 1) * scale
  const height = margin * 2 + glyphHeight
  const commands = ['q', '0 0 0 rg']

  for (let characterIndex = 0; characterIndex < text.length; characterIndex += 1) {
    const glyph = glyphs[text[characterIndex] ?? '']
    if (!glyph) throw new Error(`No raster glyph for ${text[characterIndex]}`)
    for (let y = 0; y < glyph.length; y += 1) {
      for (let x = 0; x < glyph[y]!.length; x += 1) {
        if (glyph[y]![x] !== '1') continue
        const blockX = margin + characterIndex * (glyphWidth + scale) + x * scale
        const blockY = height - margin - (y + 1) * scale
        commands.push(`${blockX} ${blockY} ${scale} ${scale} re f`)
      }
    }
  }

  commands.push('Q')
  const content = Buffer.from(`${commands.join('\n')}\n`)
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R >>`
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from('endstream'),
    ]),
  ]
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')]
  const offsets = [0]
  let offset = chunks[0]!.length
  for (const [index, object] of objects.entries()) {
    const prefix = Buffer.from(`${index + 1} 0 obj\n`)
    const suffix = Buffer.from('\nendobj\n')
    offsets.push(offset)
    chunks.push(prefix, object, suffix)
    offset += prefix.length + object.length + suffix.length
  }
  const xrefOffset = offset
  const xref = [
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`,
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ]
  return Buffer.concat([...chunks, Buffer.from(xref.join(''))])
}

function storageFor(
  downloads: Array<{ data: Blob | null; error: { message: string } | null }>,
  upload = vi.fn().mockResolvedValue({ error: null })
) {
  const download = vi.fn()
  for (const result of downloads) download.mockResolvedValueOnce(result)
  const from = vi.fn().mockReturnValue({ download, upload })
  mocks.createSupabaseAdminClient.mockReturnValue({ storage: { from } })
  return { from, download, upload }
}

describe('deterministic document extraction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes UTF-8 CSV text without involving a model', () => {
    expect(csvToText(Buffer.from('\ufeffItem,Quantity\r\nConcrete,12\r\n'))).toEqual({
      text: 'Item,Quantity\nConcrete,12',
      pages: null,
      sheets: 1,
      ocrConfidence: null,
      warnings: [],
    })
  })

  it('reuses a tenant-scoped hash/version cache before local CSV parsing', async () => {
    const source = 'Item,Quantity\nConcrete,12\n'
    const hash = sourceHash(source)
    const cachePayload = {
      extractorVersion: DETERMINISTIC_EXTRACTOR_VERSION,
      sourceSha256: hash,
      kind: 'csv',
      result: {
        status: 'extracted',
        detectedKind: 'csv',
        sourceSha256: hash,
        extractedText: 'Item,Quantity\nConcrete,12',
        extractedCharacters: 25,
        pages: null,
        sheets: 1,
        ocrConfidence: null,
        warnings: [],
        message: 'CSV read locally and cached.',
      },
    }
    const storage = storageFor([
      { data: new Blob([source]), error: null },
      { data: new Blob([JSON.stringify(cachePayload)]), error: null },
    ])

    const result = await extractDeterministicDocument({
      tenantId: TENANT_ID,
      storagePath: STORAGE_PATH,
      fileName: 'schedule.csv',
      mimeType: 'text/csv',
      kind: 'csv',
    })

    expect(result).toMatchObject({
      status: 'extracted',
      extractedText: 'Item,Quantity\nConcrete,12',
      cacheHit: true,
    })
    expect(storage.download).toHaveBeenCalledTimes(2)
    expect(storage.download).toHaveBeenLastCalledWith(
      `${TENANT_ID}/_derived/deterministic-extractions/${hash}/csv/${DETERMINISTIC_EXTRACTOR_VERSION}.json`
    )
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('writes an immutable private cache result on a cold CSV read', async () => {
    const source = 'Item,Quantity\nConcrete,12\n'
    const hash = sourceHash(source)
    const storage = storageFor([
      { data: new Blob([source]), error: null },
      { data: null, error: { message: 'Object not found' } },
    ])

    const result = await extractDeterministicDocument({
      tenantId: TENANT_ID,
      storagePath: STORAGE_PATH,
      fileName: 'schedule.csv',
      mimeType: 'text/csv',
      kind: 'csv',
    })

    expect(result).toMatchObject({
      status: 'extracted',
      sourceSha256: hash,
      extractedText: 'Item,Quantity\nConcrete,12',
      cacheHit: false,
    })
    expect(storage.upload).toHaveBeenCalledWith(
      `${TENANT_ID}/_derived/deterministic-extractions/${hash}/csv/${DETERMINISTIC_EXTRACTOR_VERSION}.json`,
      expect.any(Buffer),
      {
        contentType: 'application/json',
        cacheControl: '31536000',
        upsert: false,
      }
    )
  })

  it('reads a PDF text layer locally and caches the source evidence', async () => {
    const pdf = simplePdf('Concrete schedule')
    const storage = storageFor([
      { data: blobFromBuffer(pdf), error: null },
      { data: null, error: { message: 'Object not found' } },
    ])

    const result = await extractDeterministicDocument({
      tenantId: TENANT_ID,
      storagePath: `${TENANT_ID}/33333333-3333-4333-8333-333333333333/schedule.pdf`,
      fileName: 'schedule.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })

    expect(result).toMatchObject({
      status: 'extracted',
      detectedKind: 'pdf',
      pages: 1,
      cacheHit: false,
    })
    expect(result.extractedText).toContain('Concrete schedule')
    expect(storage.upload).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('reads workbook cell values locally before caching a spreadsheet result', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Takeoff')
    sheet.addRow(['Item', 'Quantity'])
    sheet.addRow(['Concrete', 12])
    const spreadsheet = Buffer.from(await workbook.xlsx.writeBuffer())
    const storage = storageFor([
      { data: blobFromBuffer(spreadsheet), error: null },
      { data: null, error: { message: 'Object not found' } },
    ])

    const result = await extractDeterministicDocument({
      tenantId: TENANT_ID,
      storagePath: `${TENANT_ID}/33333333-3333-4333-8333-333333333333/takeoff.xlsx`,
      fileName: 'takeoff.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      kind: 'spreadsheet',
    })

    expect(result).toMatchObject({
      status: 'extracted',
      detectedKind: 'spreadsheet',
      sheets: 1,
      cacheHit: false,
    })
    expect(result.extractedText).toContain('## Sheet: Takeoff')
    expect(result.extractedText).toContain('Concrete\t12')
    expect(storage.upload).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('reads legacy XLS cells locally before caching the evidence', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Item', 'Quantity', 'Total'],
      ['Concrete', 12],
    ])
    sheet.C2 = { t: 'n', f: 'B2*2', v: 24 }
    XLSX.utils.book_append_sheet(workbook, sheet, 'Legacy BOQ')
    const spreadsheet = Buffer.from(
      XLSX.write(workbook, { bookType: 'biff8', type: 'buffer' })
    )
    const storage = storageFor([
      { data: blobFromBuffer(spreadsheet), error: null },
      { data: null, error: { message: 'Object not found' } },
    ])

    const result = await extractDeterministicDocument({
      tenantId: TENANT_ID,
      storagePath: `${TENANT_ID}/33333333-3333-4333-8333-333333333333/legacy-boq.xls`,
      fileName: 'legacy-boq.xls',
      mimeType: 'application/vnd.ms-excel',
      kind: 'spreadsheet',
    })

    expect(result).toMatchObject({
      status: 'extracted',
      detectedKind: 'spreadsheet',
      sheets: 1,
      cacheHit: false,
    })
    expect(result.extractedText).toContain('## Sheet: Legacy BOQ')
    expect(result.extractedText).toContain('Concrete\t12\t24')
    expect(storage.upload).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('renders and reads a scanned PDF locally when no text layer exists', async () => {
    const pdf = imageOnlyPdfWithText('TEST')
    const storage = storageFor([
      { data: blobFromBuffer(pdf), error: null },
      { data: null, error: { message: 'Object not found' } },
    ])

    const result = await extractDeterministicDocument({
      tenantId: TENANT_ID,
      storagePath: `${TENANT_ID}/33333333-3333-4333-8333-333333333333/scanned-plan.pdf`,
      fileName: 'scanned-plan.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })

    expect(result).toMatchObject({
      status: 'extracted',
      detectedKind: 'pdf',
      pages: 1,
      cacheHit: false,
    })
    expect(result.extractedText).toContain('TEST')
    expect(result.ocrConfidence).toBeGreaterThan(0)
    expect(result.warnings).toContain(
      '1 PDF page had no text layer and was read with bundled local OCR.'
    )
    expect(storage.upload).toHaveBeenCalledTimes(1)
  }, 30_000)

  it('runs bundled English OCR locally for image text', async () => {
    const image = bitmapWithText('TEST')
    const storage = storageFor([
      { data: blobFromBuffer(image), error: null },
      { data: null, error: { message: 'Object not found' } },
    ])

    const result = await extractDeterministicDocument({
      tenantId: TENANT_ID,
      storagePath: `${TENANT_ID}/33333333-3333-4333-8333-333333333333/signage.bmp`,
      fileName: 'signage.bmp',
      mimeType: 'image/bmp',
      kind: 'image',
    })

    expect(result).toMatchObject({
      status: 'extracted',
      detectedKind: 'image',
      extractedText: 'TEST',
      cacheHit: false,
    })
    expect(result.ocrConfidence).toBeGreaterThan(0)
    expect(storage.upload).toHaveBeenCalledTimes(1)
  }, 30_000)
})
