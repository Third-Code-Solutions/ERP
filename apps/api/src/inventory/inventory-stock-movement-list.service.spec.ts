import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { InventoryStockMovementListService } from './inventory-stock-movement-list.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const MOVEMENT_ID = '88888888-8888-4888-8888-888888888888'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  role: 'procurement',
  email: 'procurement@example.test',
}

function harness() {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([
      {
        id: MOVEMENT_ID,
        internal_number: 'SM-2026-000001',
        movement_type: 'transfer',
        status: 'posted',
        movement_date: '2026-08-05',
        reason: 'Move accepted materials',
        source_warehouse_code: 'MAIN',
        target_warehouse_code: 'SITE-A',
        project_name: 'Site A',
        line_count: 2,
        total_value_cents: 125_000n,
      },
    ])
    .mockResolvedValueOnce([{ total: 1 }])
  const service = new InventoryStockMovementListService({
    client: { execute },
  } as unknown as DatabaseService)
  return { service, execute }
}

describe('InventoryStockMovementListService', () => {
  it('returns bounded, tenant-scoped movement register rows', async () => {
    const probe = harness()

    await expect(
      probe.service.list(
        { movementType: 'transfer', status: 'posted', page: 1, limit: 500 },
        PRINCIPAL
      )
    ).resolves.toEqual({
      tenantId: TENANT_ID,
      rows: [
        {
          id: MOVEMENT_ID,
          internalNumber: 'SM-2026-000001',
          movementType: 'transfer',
          status: 'posted',
          movementDate: '2026-08-05',
          reason: 'Move accepted materials',
          sourceWarehouseCode: 'MAIN',
          targetWarehouseCode: 'SITE-A',
          projectName: 'Site A',
          lineCount: 2,
          totalValueCents: '125000',
        },
      ],
      total: 1,
      page: 1,
      limit: 500,
      totalPages: 1,
    })

    expect(probe.execute).toHaveBeenCalledTimes(2)
    const dialect = new PgDialect()
    for (const [query] of probe.execute.mock.calls) {
      const compiled = dialect.sqlToQuery(query)
      expect(compiled.params).toContain(TENANT_ID)
    }
    const rowsSql = dialect.sqlToQuery(probe.execute.mock.calls[0]?.[0])
    expect(rowsSql.sql).toContain('limit')
    expect(rowsSql.params).toContain('transfer')
    expect(rowsSql.params).toContain('posted')
  })

  it('calculates paged totals without exposing an unbounded register', async () => {
    const probe = harness()
    probe.execute.mockReset()
    probe.execute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: '1001' }])

    await expect(
      probe.service.list({ page: 3, limit: 500 }, PRINCIPAL)
    ).resolves.toMatchObject({
      rows: [],
      total: 1001,
      page: 3,
      limit: 500,
      totalPages: 3,
    })
    const dialect = new PgDialect()
    const rowsSql = dialect.sqlToQuery(probe.execute.mock.calls[0]?.[0])
    expect(rowsSql.params).toContain(500)
    expect(rowsSql.params).toContain(1000)
  })
})
