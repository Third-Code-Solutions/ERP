import { describe, expect, it } from 'vitest'
import {
  assetListQuerySchema,
  assetListResultSchema,
  assetMaintenanceDueQuerySchema,
  assetMaintenanceDueResultSchema,
  assetMaintenanceListQuerySchema,
  createAssetMaintenanceRecordCommandSchema,
} from './assets'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('asset API contracts', () => {
  it('normalizes a bounded list query and rejects unknown fields', () => {
    expect(
      assetListQuerySchema.parse({
        q: '  excavator ',
        kind: 'equipment',
        status: 'active',
        sort: 'asset_tag',
        order: 'asc',
        page: '2',
        limit: '50',
      })
    ).toEqual({
      q: 'excavator',
      kind: 'equipment',
      status: 'active',
      sort: 'asset_tag',
      order: 'asc',
      page: 2,
      limit: 50,
    })
    expect(() => assetListQuerySchema.parse({ cursor: 'unexpected' })).toThrow()
  })

  it('keeps read rows additive, typed, and tenant-visible', () => {
    expect(
      assetListResultSchema.parse({
        rows: [
          {
            id: ASSET_ID,
            tenantId: TENANT_ID,
            assetTag: 'EQ-001',
            name: 'Excavator',
            kind: 'equipment',
            status: 'active',
            serialNumber: 'SN-001',
            manufacturer: 'Example',
            model: 'EX-1',
            assignedProjectId: null,
            assignedProjectName: null,
            location: 'Yard',
            commissionedOn: '2026-01-01',
            retiredOn: null,
            notes: null,
            createdBy: USER_ID,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      })
    ).toMatchObject({ total: 1, rows: [{ tenantId: TENANT_ID }] })
  })

  it('defaults maintenance commands and rejects an inverted service window', () => {
    expect(
      assetMaintenanceListQuerySchema.parse({ page: '1', limit: '50' })
    ).toEqual({ page: 1, limit: 50 })
    expect(
      createAssetMaintenanceRecordCommandSchema.parse({
        maintenanceType: 'inspection',
        summary: 'Annual safety inspection',
        performedOn: '2026-01-15',
      })
    ).toMatchObject({
      nextDueOn: null,
      vendorName: null,
      costCents: 0,
      notes: null,
    })
    expect(() =>
      createAssetMaintenanceRecordCommandSchema.parse({
        maintenanceType: 'repair',
        summary: 'Repair',
        performedOn: '2026-02-01',
        nextDueOn: '2026-01-31',
      })
    ).toThrow('nextDueOn must be on or after performedOn')
  })

  it('defaults the bounded maintenance due window', () => {
    expect(assetMaintenanceDueQuerySchema.parse({})).toEqual({
      daysAhead: 30,
      page: 1,
      limit: 50,
    })
  })

  it('accepts a typed maintenance due result', () => {
    expect(
      assetMaintenanceDueResultSchema.parse({
        tenantId: TENANT_ID,
        asOf: '2026-08-07',
        daysAhead: 30,
        rows: [
          {
            tenantId: TENANT_ID,
            assetId: ASSET_ID,
            assetTag: 'EQ-001',
            assetName: 'Excavator',
            assetKind: 'equipment',
            assetStatus: 'active',
            assignedProjectId: null,
            assignedProjectName: null,
            location: 'Yard',
            maintenanceRecordId: '44444444-4444-4444-8444-444444444444',
            maintenanceType: 'inspection',
            summary: 'Annual inspection',
            performedOn: '2026-01-15',
            nextDueOn: '2026-08-20',
            daysUntilDue: 13,
            dueState: 'due_soon',
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      })
    ).toMatchObject({ total: 1, rows: [{ dueState: 'due_soon' }] })
  })
})
