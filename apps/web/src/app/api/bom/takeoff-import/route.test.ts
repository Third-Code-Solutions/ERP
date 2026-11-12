import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  executeTakeoffImportThroughCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@/lib/erp-core-client', () => ({
  executeTakeoffImportThroughCoreApi:
    mocks.executeTakeoffImportThroughCoreApi,
}))

import { POST } from './route'

const BOM_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const SOURCE_KEY = 'a'.repeat(64)

function requestWithForm(values: Record<string, string | File>): NextRequest {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return new NextRequest('http://localhost/api/bom/takeoff-import', {
    method: 'POST',
    body: form,
  })
}

describe('generic takeoff import Core authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      user: { id: USER_ID },
      tenantId: TENANT_ID,
      role: 'commercial',
      email: 'commercial@example.com',
      fullName: 'Commercial',
    })
    mocks.can.mockReturnValue(true)
  })

  it('returns a structured 401 before reading the multipart body', async () => {
    mocks.requireUserProfile.mockRejectedValue(new Error('Unauthorized'))

    const response = await POST(
      new NextRequest('http://localhost/api/bom/takeoff-import', {
        method: 'POST',
      })
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
    })
    expect(mocks.executeTakeoffImportThroughCoreApi).not.toHaveBeenCalled()
  })

  it('parses the file but delegates preview validation to Core', async () => {
    const csv = [
      'Row,Description,Qty,UOM,Division,Location',
      // boq-export A.3: Web rounds a spreadsheet quantity half-up to 4 dp.
      'A-001,Suspended ceiling,12.34567,sqm,Finishes,Level 2',
      'A-002,Unmapped item,1,crate,,Level 2',
    ].join('\n')
    mocks.executeTakeoffImportThroughCoreApi.mockImplementation(
      async (command: {
        bomId: string
        source: string
        drawingRevisionKey: string
        contentSha256: string
        rows: Array<{
          sourceRowKey: string
          description: string
          quantity: number | null
          unit: string
          division: string | null
          location: string | null
          itemNo: string | null
        }>
      }) => ({
        ok: true,
        data: {
          ok: true,
          mode: 'preview',
          tenantId: TENANT_ID,
          bomId: command.bomId,
          source: command.source,
          sourceKey: SOURCE_KEY,
          drawingRevisionKey: command.drawingRevisionKey,
          contentSha256: command.contentSha256,
          rowCount: command.rows.length,
          validCount: 0,
          unresolvedCount: 3,
          missingColumns: [],
          validationIssues: [
            {
              sourceRowKey: 'A-001',
              code: 'INVALID_QUANTITY',
              message:
                'Quantity must have at most 4 decimal places and not exceed 2,147,483,647.',
            },
            {
              sourceRowKey: 'A-002',
              code: 'INVALID_UOM',
              message: 'UOM "crate" is not recognized.',
            },
            {
              sourceRowKey: 'A-002',
              code: 'MISSING_DIVISION',
              message: 'Division is required before import.',
            },
          ],
          rows: command.rows,
        },
      })
    )

    const response = await POST(
      requestWithForm({
        file: new File([csv], 'takeoff.csv', { type: 'text/csv' }),
        bom_id: BOM_ID,
        source: 'generic',
        drawing_revision_key: 'revision-1',
        mode: 'preview',
        mapping: JSON.stringify({
          sourceRowKey: 'Row',
          description: 'Description',
          quantity: 'Qty',
          unit: 'UOM',
          division: 'Division',
          location: 'Location',
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      mode: 'preview',
      source: 'generic',
      rowCount: 2,
      validCount: 0,
      unresolvedCount: 3,
      validationIssues: expect.arrayContaining([
        expect.objectContaining({
          sourceRowKey: 'A-001',
          code: 'INVALID_QUANTITY',
        }),
        expect.objectContaining({ code: 'INVALID_UOM' }),
        expect.objectContaining({ code: 'MISSING_DIVISION' }),
      ]),
    })
    expect(mocks.executeTakeoffImportThroughCoreApi).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'preview',
        bomId: BOM_ID,
        source: 'generic',
        drawingRevisionKey: 'revision-1',
        fileName: 'takeoff.csv',
        contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        rows: expect.arrayContaining([
          expect.objectContaining({ sourceRowKey: 'A-001', quantity: 12.3457 }),
        ]),
      }),
      TENANT_ID
    )
  })

  it('reads the chosen sheet and header row, sends rates, and returns sheet facts', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Notes').addRow(['ignore me'])
    const sheet = workbook.addWorksheet('Estimate')
    sheet.addRow(['Client estimate'])
    sheet.addRow(['Description', 'Qty', 'Unit', 'Unit Rate', 'Amount', 'Division'])
    sheet.addRow(['Paint', 10, 'sqm', '₱ 150.00', '1,600.00', 'Finishes'])
    sheet.addRow(['Total', '', '', '', '1,600.00', ''])
    const file = new File(
      [Buffer.from(await workbook.xlsx.writeBuffer())],
      'estimate.xlsx'
    )
    mocks.executeTakeoffImportThroughCoreApi.mockImplementation(
      async (command: { bomId: string; rows: unknown[] }) => ({
        ok: true,
        data: {
          ok: true,
          mode: 'preview',
          tenantId: TENANT_ID,
          bomId: command.bomId,
          rowCount: command.rows.length,
        },
      })
    )

    const response = await POST(
      requestWithForm({
        file,
        bom_id: BOM_ID,
        mode: 'preview',
        sheet: 'Estimate',
        header_row: '2',
        mapping: JSON.stringify({
          description: 'Description',
          quantity: 'Qty',
          unit: 'Unit',
          unitRate: 'Unit Rate',
          amount: 'Amount',
          division: 'Division',
        }),
      })
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      rowCount: 1,
      headerRow: 2,
      skippedRows: 1,
      // The Total row is not imported, and the user sees which amount was left out.
      skippedAmountRows: [
        {
          sheet: 'Estimate',
          row: 4,
          label: 'Total',
          amount: '1,600.00',
          reason: expect.stringContaining('Total row'),
        },
      ],
      sectionRows: 0,
      workbook: { sheets: ['Notes', 'Estimate'], sheet: 'Estimate' },
      warnings: [
        expect.objectContaining({ sourceRowKey: 'row-3', code: 'AMOUNT_MISMATCH' }),
      ],
    })
    expect(mocks.executeTakeoffImportThroughCoreApi).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [
          expect.objectContaining({
            description: 'Paint',
            quantity: 10,
            unit: 'sqm',
            division: 'Finishes',
            unitRateCentavos: 15_000,
          }),
        ],
      }),
      TENANT_ID
    )
  })

  it.each(['0', '51', '2.5', 'two'])(
    'rejects header row %s before parsing',
    async (headerRow) => {
      const response = await POST(
        requestWithForm({
          file: new File(['Description,Qty,UOM\nCeiling,1,sqm'], 'takeoff.csv'),
          bom_id: BOM_ID,
          mode: 'preview',
          header_row: headerRow,
        })
      )

      expect(response.status).toBe(422)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'INVALID_HEADER_ROW' },
      })
      expect(mocks.executeTakeoffImportThroughCoreApi).not.toHaveBeenCalled()
    }
  )

  it('returns a terminal Core failure without a Web transaction fallback', async () => {
    mocks.executeTakeoffImportThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'ERP Core API is unavailable. No takeoff data was committed.',
    })

    const response = await POST(
      requestWithForm({
        file: new File(['Description,Qty,UOM\nCeiling,1,sqm'], 'takeoff.csv'),
        bom_id: BOM_ID,
        mode: 'commit',
      })
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: 'TAKEOFF_CORE_UNAVAILABLE',
        message: 'ERP Core API is unavailable. No takeoff data was committed.',
      },
    })
  })

  it('returns 413 for an oversize Content-Length without reading the body', async () => {
    const request = requestWithForm({
      file: new File(['Description,Qty,UOM\nCeiling,1,sqm'], 'takeoff.csv'),
      bom_id: BOM_ID,
    })
    request.headers.set('content-length', String(26 * 1024 * 1024))
    const formData = vi.spyOn(request, 'formData')

    const response = await POST(request)

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FILE_TOO_LARGE' } })
    expect(formData).not.toHaveBeenCalled()
  })

  it('stops reading a body that declares no length once it is over the limit (S3-M4)', async () => {
    // A chunked upload: 1 MB at a time, for as long as the route keeps pulling.
    let pulled = 0
    let cancelled = false
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
      cancel() {
        cancelled = true
      },
    })
    const request = new NextRequest('http://localhost/api/bom/takeoff-import', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: endless,
      duplex: 'half',
    } as ConstructorParameters<typeof NextRequest>[1])

    const response = await POST(request)

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'FILE_TOO_LARGE' } })
    expect(cancelled).toBe(true)
    // 25 MB is the limit: the route stopped just past it instead of buffering on.
    expect(pulled).toBeLessThan(40)
    expect(mocks.executeTakeoffImportThroughCoreApi).not.toHaveBeenCalled()
  })

  it('imports 5,000 rows and rejects 5,001 with 413', async () => {
    mocks.executeTakeoffImportThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { ok: true, mode: 'preview' },
    })
    const csv = (rows: number) =>
      ['Description,Qty,UOM', ...Array.from({ length: rows }, (_, index) => `Item ${index},1,sqm`)].join('\n')
    const post = (rows: number) =>
      POST(
        requestWithForm({
          file: new File([csv(rows)], 'takeoff.csv'),
          bom_id: BOM_ID,
          mode: 'preview',
        })
      )

    expect((await post(5_000)).status).toBe(200)
    expect(mocks.executeTakeoffImportThroughCoreApi.mock.calls[0]?.[0].rows).toHaveLength(5_000)

    const tooMany = await post(5_001)
    expect(tooMany.status).toBe(413)
    await expect(tooMany.json()).resolves.toMatchObject({
      error: { code: 'TAKEOFF_TOO_LARGE', message: expect.stringContaining('5,000 rows') },
    })
    expect(mocks.executeTakeoffImportThroughCoreApi).toHaveBeenCalledTimes(1)
  })

  it('returns 413 for a sparse workbook whose used range reaches column XFD', async () => {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('BOQ')
    sheet.addRow(['Description', 'Qty', 'UOM'])
    for (let row = 2; row <= 50; row += 1) sheet.getCell(row, 16_384).value = 1

    const response = await POST(
      requestWithForm({
        file: new File([Buffer.from(await workbook.xlsx.writeBuffer())], 'sparse.xlsx'),
        bom_id: BOM_ID,
        mode: 'preview',
      })
    )

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TAKEOFF_TOO_LARGE', message: expect.stringContaining('16,384 columns') },
    })
    expect(mocks.executeTakeoffImportThroughCoreApi).not.toHaveBeenCalled()
  })

  it('accepts a blanked optional column and does not forward it to Core', async () => {
    mocks.executeTakeoffImportThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { ok: true, mode: 'preview' },
    })

    const response = await POST(
      requestWithForm({
        file: new File(['Description,Qty,UOM,Rate\nCeiling,1,sqm,150'], 'takeoff.csv'),
        bom_id: BOM_ID,
        mode: 'preview',
        mapping: JSON.stringify({
          description: 'Description',
          quantity: 'Qty',
          unit: 'UOM',
          unitRate: '',
        }),
      })
    )

    expect(response.status).toBe(200)
    const command = mocks.executeTakeoffImportThroughCoreApi.mock.calls[0]?.[0]
    expect(command.mapping).toEqual({ description: 'Description', quantity: 'Qty', unit: 'UOM' })
    expect(command.rows[0]).not.toHaveProperty('unitRateCentavos')
  })

  it('rejects a malformed mapping before calling Core', async () => {
    const response = await POST(
      requestWithForm({
        file: new File(['Description,Qty,UOM\nCeiling,1,sqm'], 'takeoff.csv'),
        bom_id: BOM_ID,
        mode: 'preview',
        mapping: '{not-json',
      })
    )

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_MAPPING' },
    })
    expect(mocks.executeTakeoffImportThroughCoreApi).not.toHaveBeenCalled()
  })
})
