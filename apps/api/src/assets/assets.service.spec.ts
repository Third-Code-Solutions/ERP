import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { AssetMaintenanceService } from './asset-maintenance.service'
import { AssetsService } from './assets.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '11111111-1111-4111-8111-111111111111'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'viewer',
  email: 'viewer@example.test',
}

const ASSET_ROW = {
  id: ASSET_ID,
  tenantId: TENANT_ID,
  assetTag: 'EQ-001',
  name: 'Excavator',
  kind: 'equipment' as const,
  status: 'active' as const,
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
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function listHarness(rows = [ASSET_ROW], total = rows.length) {
  const rowOffset = vi.fn().mockResolvedValue(rows)
  const rowLimit = vi.fn().mockReturnValue({ offset: rowOffset })
  const rowOrderBy = vi.fn().mockReturnValue({ limit: rowLimit })
  const rowWhere = vi.fn().mockReturnValue({ orderBy: rowOrderBy })
  const rowJoin = vi.fn().mockReturnValue({ where: rowWhere })
  const rowFrom = vi.fn().mockReturnValue({ leftJoin: rowJoin })
  const countWhere = vi.fn().mockResolvedValue([{ count: total }])
  const countFrom = vi.fn().mockReturnValue({ where: countWhere })
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: rowFrom })
    .mockReturnValueOnce({ from: countFrom })
  const database = { client: { select } } as unknown as DatabaseService
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_ASSET_READS_ENABLED') return true
      if (key === 'ERP_ASSET_READS_TENANT_IDS') return [TENANT_ID]
      return fallback
    }),
  } as unknown as ConfigService
  return { service: new AssetsService(config, database), select, rowWhere, rowLimit, rowOffset, countWhere }
}

const DUE_ROW = {
  tenant_id: TENANT_ID,
  asset_id: ASSET_ID,
  asset_tag: 'EQ-001',
  asset_name: 'Excavator',
  asset_kind: 'equipment' as const,
  asset_status: 'active' as const,
  assigned_project_id: null,
  assigned_project_name: null,
  location: 'Yard',
  maintenance_record_id: '44444444-4444-4444-8444-444444444444',
  maintenance_type: 'inspection' as const,
  summary: 'Annual inspection',
  performed_on: '2026-01-15',
  next_due_on: '2026-08-20',
  days_until_due: 13,
  due_state: 'due_soon' as const,
  total_count: 1,
}

function dueHarness(rows = [DUE_ROW]) {
  const execute = vi.fn().mockResolvedValue(rows)
  const config = {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_ASSET_MAINTENANCE_READS_ENABLED') return true
      if (key === 'ERP_ASSET_MAINTENANCE_READS_TENANT_IDS') return [TENANT_ID]
      return fallback
    }),
  } as unknown as ConfigService
  return {
    service: new AssetMaintenanceService(
      config,
      { client: { execute } } as unknown as DatabaseService,
      new AuditService()
    ),
    execute,
  }
}

describe('AssetsService', () => {
  it('fails closed before touching the database', async () => {
    const select = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const database = { client: { select } } as unknown as DatabaseService
    const service = new AssetsService(config, database)

    await expect(
      service.list(
        {
          q: undefined,
          kind: undefined,
          status: undefined,
          sort: 'created_at',
          order: 'desc',
          page: 1,
          limit: 20,
        },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(select).not.toHaveBeenCalled()
  })

  it('returns typed, paginated, tenant-scoped asset rows', async () => {
    const probe = listHarness([ASSET_ROW], 21)
    const result = await probe.service.list(
      {
        q: 'Exc',
        kind: 'equipment',
        status: 'active',
        sort: 'asset_tag',
        order: 'asc',
        page: 2,
        limit: 20,
      },
      PRINCIPAL
    )

    expect(result).toMatchObject({
      total: 21,
      page: 2,
      limit: 20,
      totalPages: 2,
      rows: [
        expect.objectContaining({
          id: ASSET_ID,
          tenantId: TENANT_ID,
          assetTag: 'EQ-001',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      ],
    })
    expect(probe.rowLimit).toHaveBeenCalledWith(20)
    expect(probe.rowOffset).toHaveBeenCalledWith(20)
    const querySql = new PgDialect().sqlToQuery(
      probe.rowWhere.mock.calls[0]?.[0]
    )
    expect(querySql.sql).toContain('"assets"."tenant_id" = $1')
    expect(querySql.params).toContain(TENANT_ID)
    expect(querySql.params).toContain('%Exc%')
    expect(querySql.params).toContain('equipment')
    expect(querySql.params).toContain('active')
  })

  it('returns the latest maintenance record in a bounded due window', async () => {
    const probe = dueHarness()
    const result = await probe.service.maintenanceDue(
      { asOf: '2026-08-07', daysAhead: 30, page: 1, limit: 50 },
      PRINCIPAL
    )

    expect(result).toMatchObject({
      tenantId: TENANT_ID,
      asOf: '2026-08-07',
      daysAhead: 30,
      total: 1,
      rows: [
        expect.objectContaining({
          assetId: ASSET_ID,
          maintenanceRecordId: DUE_ROW.maintenance_record_id,
          nextDueOn: '2026-08-20',
          daysUntilDue: 13,
          dueState: 'due_soon',
        }),
      ],
    })
    expect(probe.execute).toHaveBeenCalledTimes(1)
    const querySql = new PgDialect().sqlToQuery(
      probe.execute.mock.calls[0]?.[0]
    )
    expect(querySql.sql).toContain('join lateral')
    expect(querySql.sql).toContain('count(*) over()')
    expect(querySql.params).toContain(TENANT_ID)
    expect(querySql.params).toContain('2026-08-07')
    expect(querySql.params).toContain(30)
  })

  it('fails closed before due-query execution', async () => {
    const execute = vi.fn()
    const config = {
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    } as unknown as ConfigService
    const service = new AssetMaintenanceService(
      config,
      { client: { execute } } as unknown as DatabaseService,
      new AuditService()
    )

    await expect(
      service.maintenanceDue(
        { asOf: '2026-08-07', daysAhead: 30, page: 1, limit: 50 },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(execute).not.toHaveBeenCalled()
  })
})
