import { NextRequest } from 'next/server'
import type { AppRole } from '@third-code-erp/auth'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { canUniversalSearchEntity } from '@third-code-erp/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoqExportData } from '@/lib/operations/boq-excel/workbook'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  loadBoqExport: vi.fn(),
}))

vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import('@third-code-erp/shared-types/authorization')
  return { can: roleHasCapability, getUserProfile: mocks.getUserProfile }
})

vi.mock('./bom-export-data', () => ({ loadBoqExport: mocks.loadBoqExport }))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const BOM_ID = '33333333-3333-4333-8333-333333333333'

const DATA: BoqExportData = {
  project: { name: 'Clinic', code: 'PRJ-1', client: 'Client' },
  bom: {
    version: 2,
    status: 'approved',
    label: null,
    total_cost_cents: 1_000,
    tcv_cents: 1_000,
    gp_cents: 0,
    gp_margin_bps: 0,
  },
  lines: [],
  dupas: [],
}

function profile(role: AppRole = 'admin') {
  return { role, tenantId: TENANT_ID, user: { id: 'user' }, email: 'a@example.test', fullName: 'A' }
}

function request(id = BOM_ID): Promise<Response> {
  return GET(new NextRequest(`http://localhost/api/bom/${id}/export`), {
    params: Promise.resolve({ id }),
  })
}

describe('BOQ Excel export route', () => {
  beforeEach(() => {
    mocks.getUserProfile.mockReset()
    mocks.loadBoqExport.mockReset()
    mocks.loadBoqExport.mockResolvedValue(DATA)
  })

  it('returns 401 before loading anything without a session', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(401)
    expect(mocks.loadBoqExport).not.toHaveBeenCalled()
  })

  it.each(ERP_ROLES)('applies the BOM view policy for %s', async (role) => {
    mocks.getUserProfile.mockResolvedValue(profile(role))

    const response = await request()

    const allowed = canUniversalSearchEntity(role, 'bom')
    expect(response.status).toBe(allowed ? 200 : 403)
    expect(mocks.loadBoqExport).toHaveBeenCalledTimes(allowed ? 1 : 0)
  })

  it('returns 404 for a BOM outside the caller tenant', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.loadBoqExport.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(404)
    expect(mocks.loadBoqExport).toHaveBeenCalledWith(TENANT_ID, BOM_ID)
  })

  it('returns 404 for a malformed id without querying', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())

    const response = await request('not-a-uuid')

    expect(response.status).toBe(404)
    expect(mocks.loadBoqExport).not.toHaveBeenCalled()
  })

  it('returns a private xlsx attachment', async () => {
    mocks.getUserProfile.mockResolvedValue(profile('commercial'))

    const response = await request()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="BOQ-PRJ-1-v2-\d{8}\.xlsx"$/,
    )
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    const bytes = new Uint8Array(await response.arrayBuffer())
    // xlsx is a zip: "PK"
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
  })

  it('maps a load failure to a generic 500', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.loadBoqExport.mockRejectedValue(new Error('sensitive diagnostics'))

    const response = await request()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Export unavailable' })
  })
})
