import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'

const coreMocks = vi.hoisted(() => ({
  getInventorySummaryThroughCoreApi: vi.fn(),
  inventorySummaryReadsUseCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: vi.fn(), execute: vi.fn() },
}))
vi.mock('./erp-core-client', () => coreMocks)

import { db } from '@third-code-erp/database'
import {
  getInventorySummary,
  MAX_BALANCES,
  MAX_ITEMS,
} from './inventory-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999'
const UOM_ID = '11111111-1111-4111-8111-111111111111'
const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'
const ITEM_ID = '44444444-4444-4444-8444-444444444444'

const CORE_RESULT = {
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
  projects: [],
  balances: [
    {
      warehouseId: WAREHOUSE_ID,
      warehouseCode: 'MAIN',
      warehouseName: 'Main store',
      itemId: ITEM_ID,
      itemCode: 'CEMENT',
      itemDescription: 'Cement',
      uomCode: 'EA',
      quantityMicros: '-2500000',
      valueCents: '10001',
    },
  ],
  balancesTruncated: false,
  receiptCounts: { draftCount: 1, postedCount: 2 },
}

describe('getInventorySummary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps the tenant-gated Nest result to the existing page shape', async () => {
    coreMocks.inventorySummaryReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getInventorySummaryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: CORE_RESULT,
    })

    await expect(getInventorySummary(TENANT_ID)).resolves.toEqual({
      uoms: [
        {
          id: UOM_ID,
          code: 'EA',
          name: 'Each',
          decimal_places: 0,
          is_active: true,
        },
      ],
      warehouseRows: [
        {
          id: WAREHOUSE_ID,
          code: 'MAIN',
          name: 'Main store',
          project_id: null,
          is_active: true,
        },
      ],
      items: [
        {
          id: ITEM_ID,
          code: 'CEMENT',
          description: 'Cement',
          base_uom_id: UOM_ID,
          inventory_tracked: true,
          is_active: true,
        },
      ],
      projectRows: [],
      balances: [
        expect.objectContaining({
          quantity_micros: -2_500_000,
          value_cents: 10_001,
        }),
      ],
      receiptCounts: { draft_count: 1, posted_count: 2 },
      truncated: { setup: false, balances: false },
      totalValueCents: 10_001,
    })
  })

  it('fails closed on tenant drift or a truncated core response', async () => {
    coreMocks.inventorySummaryReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getInventorySummaryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { ...CORE_RESULT, tenantId: OTHER_TENANT_ID },
    })
    await expect(getInventorySummary(TENANT_ID)).rejects.toThrow(
      'invalid tenant scope'
    )

    coreMocks.getInventorySummaryThroughCoreApi.mockResolvedValue({
      ok: true,
      data: { ...CORE_RESULT, balancesTruncated: true },
    })
    await expect(getInventorySummary(TENANT_ID)).rejects.toThrow(
      'exceeds the display limit'
    )
  })

  it('keeps the legacy path tenant-scoped when the gate is closed', async () => {
    coreMocks.inventorySummaryReadsUseCoreApi.mockReturnValue(false)

    const list = (rows: unknown[]) => {
      const limit = vi.fn().mockResolvedValue(rows)
      const orderBy = vi.fn().mockReturnValue({ limit })
      const where = vi.fn().mockReturnValue({ orderBy })
      const from = vi.fn().mockReturnValue({ where })
      return { from, where }
    }
    const uoms = list([
      { id: UOM_ID, code: 'EA', name: 'Each', decimal_places: 0, is_active: true },
    ])
    const warehouses = list([])
    const items = list([])
    const projects = list([])
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: uoms.from } as never)
      .mockReturnValueOnce({ from: warehouses.from } as never)
      .mockReturnValueOnce({ from: items.from } as never)
      .mockReturnValueOnce({ from: projects.from } as never)
    vi.mocked(db.execute)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ draft_count: 0, posted_count: 0 }] as never)

    await expect(getInventorySummary(TENANT_ID)).resolves.toMatchObject({
      uoms: [
        {
          id: UOM_ID,
          code: 'EA',
          name: 'Each',
          decimal_places: 0,
          is_active: true,
        },
      ],
    })

    const dialect = new PgDialect()
    expect(
      [uoms, warehouses, items, projects].every((query) =>
        dialect.sqlToQuery(query.where.mock.calls[0]?.[0]).params.includes(TENANT_ID)
      )
    ).toBe(true)
    expect(
      vi.mocked(db.execute).mock.calls.every((call) =>
        dialect.sqlToQuery(call[0] as never).params.includes(TENANT_ID)
      )
    ).toBe(true)
  })

  it('cuts oversized legacy lists with a flag instead of throwing', async () => {
    coreMocks.inventorySummaryReadsUseCoreApi.mockReturnValue(false)

    const list = (rows: unknown[]) => {
      const limit = vi.fn().mockResolvedValue(rows)
      const orderBy = vi.fn().mockReturnValue({ limit })
      const where = vi.fn().mockReturnValue({ orderBy })
      return { from: vi.fn().mockReturnValue({ where }) }
    }
    const itemRow = (index: number) => ({
      id: `item-${index}`,
      code: `ITEM-${index}`,
      description: 'Cement',
      base_uom_id: UOM_ID,
      inventory_tracked: true,
      is_active: true,
    })
    const balanceRow = (index: number) => ({
      warehouse_id: WAREHOUSE_ID,
      warehouse_code: 'MAIN',
      warehouse_name: 'Main store',
      item_id: `item-${index}`,
      item_code: `ITEM-${index}`,
      item_description: 'Cement',
      uom_code: 'EA',
      quantity_micros: '1000000',
      value_cents: '100',
      total_value_cents: '999999',
    })
    vi.mocked(db.select)
      .mockReturnValueOnce(list([]) as never)
      .mockReturnValueOnce(list([]) as never)
      .mockReturnValueOnce(
        list(Array.from({ length: MAX_ITEMS + 1 }, (_, i) => itemRow(i))) as never
      )
      .mockReturnValueOnce(list([]) as never)
    vi.mocked(db.execute)
      .mockResolvedValueOnce(
        Array.from({ length: MAX_BALANCES + 1 }, (_, i) => balanceRow(i)) as never
      )
      .mockResolvedValueOnce([{ draft_count: 0, posted_count: 0 }] as never)

    const summary = await getInventorySummary(TENANT_ID)

    expect(summary.items).toHaveLength(MAX_ITEMS)
    expect(summary.balances).toHaveLength(MAX_BALANCES)
    expect(summary.truncated).toEqual({ setup: true, balances: true })
    // The headline value covers every balance, not just the 500 listed.
    expect(summary.totalValueCents).toBe(999_999)
  })
})
