import { NextRequest } from 'next/server'
import type { AppRole } from '@third-code-erp/auth'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { canUniversalSearchEntity } from '@third-code-erp/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BoqExportTooLargeError, type BoqExportData } from '@/lib/operations/boq-excel/workbook'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  loadBoqExport: vi.fn(),
  deniedCapability: null as string | null,
}))

vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import('@third-code-erp/shared-types/authorization')
  return {
    // The real capability registry, minus one capability a test takes away.
    can: (role: AppRole, capability: Parameters<typeof roleHasCapability>[1]) =>
      capability !== mocks.deniedCapability && roleHasCapability(role, capability),
    getUserProfile: mocks.getUserProfile,
  }
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
    mocks.deniedCapability = null
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

  it('requires project.read as the project layout around the BOM page does', async () => {
    mocks.getUserProfile.mockResolvedValue(profile('admin'))
    mocks.deniedCapability = 'project.read'

    const response = await request()

    expect(response.status).toBe(403)
    expect(mocks.loadBoqExport).not.toHaveBeenCalled()
  })

  it('answers 422 with the reason when the BOM has too many lines to export', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.loadBoqExport.mockRejectedValue(new BoqExportTooLargeError())

    const response = await request()

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      error: 'This BOM has more than 20,000 lines and cannot be exported to one workbook.',
    })
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

  it('exports a groups-only BOM as section rows with zero totals and no DUPA sheet', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    const group = (id: string, description: string, sort: string) => ({
      id,
      item_no: sort,
      code: null,
      description,
      division_id: null,
      division: null,
      location: null,
      unit: null,
      quantity: '0',
      unit_cost_cents: 0,
      line_total_cents: 0,
      unit_rate_source: 'manual',
      notes: null,
      is_group: 1,
      parent_line_item_id: null,
    })
    mocks.loadBoqExport.mockResolvedValue({
      ...DATA,
      bom: { ...DATA.bom, total_cost_cents: 0, tcv_cents: 0 },
      lines: [group('g1', 'General requirements', 'A'), group('g2', 'Earthworks', 'B')],
    })

    const response = await request()

    expect(response.status).toBe(200)
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await response.arrayBuffer())
    const sheet = workbook.getWorksheet('BOQ')!
    const rows: unknown[][] = []
    sheet.eachRow((row) => rows.push([1, 3, 7, 8, 9].map((column) => row.getCell(column).value ?? null)))
    const header = rows.findIndex((row) => row[0] === 'Item No')

    expect(rows.slice(header + 1)).toEqual([
      ['A', 'General requirements', null, null, null],
      ['B', 'Earthworks', null, null, null],
      [null, 'Total cost', null, null, 0],
      [null, 'Total contract value (TCV)', null, null, 0],
      [null, 'Total gross profit (GP)', null, null, 0],
      [null, 'Total GP margin', null, null, 0],
    ])
    expect(workbook.getWorksheet('DUPA')).toBeUndefined()
  })

  it('maps bad stored data to the generic 500 instead of throwing', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.loadBoqExport.mockResolvedValue({
      ...DATA,
      lines: [
        {
          id: 'bad',
          item_no: '1',
          code: null,
          description: 'Corrupt quantity',
          division_id: null,
          division: null,
          location: null,
          unit: 'lot',
          quantity: 'not-a-number',
          unit_cost_cents: 100,
          line_total_cents: 100,
          unit_rate_source: 'manual',
          notes: null,
          is_group: 0,
          parent_line_item_id: null,
        },
      ],
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await request()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Export unavailable' })
    error.mockRestore()
  })

  it('maps a load failure to a generic 500', async () => {
    mocks.getUserProfile.mockResolvedValue(profile())
    mocks.loadBoqExport.mockRejectedValue(new Error('sensitive diagnostics'))

    const response = await request()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Export unavailable' })
  })
})
