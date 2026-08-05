import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
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
})
