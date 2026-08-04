import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseService } from '../database/database.service'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { InventorySummaryService } from './inventory-summary.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const UOM_ID = '11111111-1111-4111-8111-111111111111'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'
const ITEM_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = '55555555-5555-4555-8555-555555555555'

const PRINCIPAL: ErpPrincipal = {
  userId: '66666666-6666-4666-8666-666666666666',
  tenantId: TENANT_ID,
  role: 'procurement',
  email: 'procurement@example.test',
}

function listQuery<T>(rows: T[]) {
  const limit = vi.fn().mockResolvedValue(rows)
  const orderBy = vi.fn().mockReturnValue({ limit })
  const where = vi.fn().mockReturnValue({ orderBy })
  const from = vi.fn().mockReturnValue({ where })
  return { from, where, orderBy, limit }
}

function harness() {
  const uoms = listQuery([
    {
      id: UOM_ID,
      code: 'EA',
      name: 'Each',
      decimalPlaces: 0,
      isActive: true,
    },
  ])
  const warehouses = listQuery([
    {
      id: WAREHOUSE_ID,
      code: 'MAIN',
      name: 'Main store',
      projectId: null,
      isActive: true,
    },
  ])
  const items = listQuery([
    {
      id: ITEM_ID,
      code: 'CEMENT',
      description: 'Cement',
      baseUomId: UOM_ID,
      inventoryTracked: true,
      isActive: true,
    },
  ])
  const projects = listQuery([{ id: PROJECT_ID, name: 'Site A' }])
  const balanceRows = [
    {
      warehouse_id: WAREHOUSE_ID,
      warehouse_code: 'MAIN',
      warehouse_name: 'Main store',
      item_id: ITEM_ID,
      item_code: 'CEMENT',
      item_description: 'Cement',
      uom_code: 'EA',
      quantity_micros: 4_250_000n,
      value_cents: 10_001n,
    },
  ]
  const execute = vi
    .fn()
    .mockResolvedValueOnce(balanceRows)
    .mockResolvedValueOnce([{ draft_count: '1', posted_count: '2' }])
  const select = vi
    .fn()
    .mockReturnValueOnce({ from: uoms.from })
    .mockReturnValueOnce({ from: warehouses.from })
    .mockReturnValueOnce({ from: items.from })
    .mockReturnValueOnce({ from: projects.from })

  return {
    service: new InventorySummaryService({ client: { select, execute } } as unknown as DatabaseService),
    select,
    execute,
    lists: [uoms, warehouses, items, projects],
  }
}

describe('InventorySummaryService', () => {
  it('returns exact, bounded tenant-scoped inventory data', async () => {
    const probe = harness()

    await expect(probe.service.read(PRINCIPAL)).resolves.toEqual({
      tenantId: TENANT_ID,
      uoms: [
        {
          id: UOM_ID,
          code: 'EA',
          name: 'Each',
          decimalPlaces: 0,
          isActive: true,
        },
      ],
      warehouses: [
        {
          id: WAREHOUSE_ID,
          code: 'MAIN',
          name: 'Main store',
          projectId: null,
          isActive: true,
        },
      ],
      items: [
        {
          id: ITEM_ID,
          code: 'CEMENT',
          description: 'Cement',
          baseUomId: UOM_ID,
          inventoryTracked: true,
          isActive: true,
        },
      ],
      projects: [{ id: PROJECT_ID, name: 'Site A' }],
      balances: [
        {
          warehouseId: WAREHOUSE_ID,
          warehouseCode: 'MAIN',
          warehouseName: 'Main store',
          itemId: ITEM_ID,
          itemCode: 'CEMENT',
          itemDescription: 'Cement',
          uomCode: 'EA',
          quantityMicros: '4250000',
          valueCents: '10001',
        },
      ],
      balancesTruncated: false,
      receiptCounts: { draftCount: 1, postedCount: 2 },
    })

    const dialect = new PgDialect()
    expect(
      probe.lists.every((list) =>
        dialect.sqlToQuery(list.where.mock.calls[0]?.[0]).params.includes(TENANT_ID)
      )
    ).toBe(true)
    expect(probe.execute).toHaveBeenCalledTimes(2)
    expect(
      probe.execute.mock.calls.every((call) =>
        dialect.sqlToQuery(call[0]).params.includes(TENANT_ID)
      )
    ).toBe(true)
    expect(dialect.sqlToQuery(probe.execute.mock.calls[0]?.[0]).sql).toMatch(
      /limit \$\d+/
    )
  })

  it('marks the bounded balance window when more rows exist', async () => {
    const probe = harness()
    const tooMany = Array.from({ length: 501 }, (_, index) => ({
      warehouse_id: WAREHOUSE_ID,
      warehouse_code: 'MAIN',
      warehouse_name: 'Main store',
      item_id: ITEM_ID,
      item_code: `ITEM-${index}`,
      item_description: 'Item',
      uom_code: 'EA',
      quantity_micros: 1,
      value_cents: 1,
    }))
    probe.execute.mockReset()
    probe.execute
      .mockResolvedValueOnce(tooMany)
      .mockResolvedValueOnce([{ draft_count: 0, posted_count: 0 }])

    await expect(probe.service.read(PRINCIPAL)).resolves.toMatchObject({
      balancesTruncated: true,
      balances: expect.any(Array),
    })
  })
})
