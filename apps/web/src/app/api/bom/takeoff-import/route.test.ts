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
      'A-001,Suspended ceiling,12.5,sqm,Finishes,Level 2',
      'A-002,Unmapped item,1,box,,Level 2',
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
                'Fractional quantity requires decimal BOM precision before it can be committed.',
            },
            {
              sourceRowKey: 'A-002',
              code: 'INVALID_UOM',
              message: 'UOM "box" is not recognized.',
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
          expect.objectContaining({ sourceRowKey: 'A-001', quantity: 12.5 }),
        ]),
      }),
      TENANT_ID
    )
  })

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
