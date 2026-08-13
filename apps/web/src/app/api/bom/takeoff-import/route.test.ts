import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLogInTransaction: vi.fn(),
}))

import { POST } from './route'

const BOM_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'

function requestWithForm(values: Record<string, string | File>): NextRequest {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) form.set(key, value)
  return new NextRequest('http://localhost/api/bom/takeoff-import', {
    method: 'POST',
    body: form,
  })
}

describe('generic takeoff import API', () => {
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
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: BOM_ID, project_id: PROJECT_ID, status: 'draft' }],
        }),
      }),
    })
  })

  it('returns a structured 401 before reading the multipart body', async () => {
    mocks.requireUserProfile.mockRejectedValue(new Error('Unauthorized'))

    const response = await POST(new NextRequest('http://localhost/api/bom/takeoff-import', { method: 'POST' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
    })
  })

  it('previews valid and unresolved rows without database writes', async () => {
    const csv = [
      'Row,Description,Qty,UOM,Division,Location',
      'A-001,Suspended ceiling,12.5,sqm,Finishes,Level 2',
      'A-002,Unmapped item,1,box,,Level 2',
    ].join('\n')
    const response = await POST(requestWithForm({
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
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      mode: 'preview',
      source: 'generic',
      rowCount: 2,
      validCount: 1,
      unresolvedCount: 2,
      validationIssues: expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_UOM' }),
        expect.objectContaining({ code: 'MISSING_DIVISION' }),
      ]),
    })
    expect(mocks.select).toHaveBeenCalledOnce()
  })

  it('rejects a malformed mapping at the API boundary', async () => {
    const response = await POST(requestWithForm({
      file: new File(['Description,Qty,UOM\nCeiling,1,sqm'], 'takeoff.csv'),
      bom_id: BOM_ID,
      mode: 'preview',
      mapping: '{not-json',
    }))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_MAPPING' },
    })
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
