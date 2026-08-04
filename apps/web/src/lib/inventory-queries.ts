import { db } from '@third-code-erp/database'
import {
  materialItems,
  projects,
  unitsOfMeasure,
  warehouses,
} from '@third-code-erp/database/schema'
import { asc, eq, sql } from 'drizzle-orm'
import type { InventorySummaryResult } from '@third-code-erp/shared-types'
import {
  getInventorySummaryThroughCoreApi,
  inventorySummaryReadsUseCoreApi,
} from './erp-core-client'

const MAX_UOMS = 500
const MAX_WAREHOUSES = 500
const MAX_ITEMS = 1_000
const MAX_PROJECTS = 500
const MAX_BALANCES = 500

export interface InventoryBalancePageRow {
  [key: string]: unknown
  warehouse_id: string
  warehouse_code: string
  warehouse_name: string
  item_id: string
  item_code: string
  item_description: string
  uom_code: string
  quantity_micros: number
  value_cents: number
}

export interface InventorySummaryPageData {
  uoms: Array<{
    id: string
    code: string
    name: string
    decimal_places: number
    is_active: boolean
  }>
  warehouseRows: Array<{
    id: string
    code: string
    name: string
    project_id: string | null
    is_active: boolean
  }>
  items: Array<{
    id: string
    code: string
    description: string
    base_uom_id: string
    inventory_tracked: boolean
    is_active: boolean
  }>
  projectRows: Array<{ id: string; code: string; name: string }>
  balances: InventoryBalancePageRow[]
  receiptCounts: { draft_count: number; posted_count: number }
}

function integerToSafeNumber(value: string | number | bigint, label: string): number {
  let exact: bigint
  try {
    exact = typeof value === 'bigint' ? value : BigInt(String(value))
  } catch {
    throw new Error(`Inventory ${label} is not an integer`)
  }
  const result = Number(exact)
  if (!Number.isSafeInteger(result)) {
    throw new Error(`Inventory ${label} exceeds the safe display range`)
  }
  return result
}

function mapCoreSummary(
  tenantId: string,
  data: InventorySummaryResult
): InventorySummaryPageData {
  if (data.tenantId.toLowerCase() !== tenantId.toLowerCase()) {
    throw new Error('Inventory summary returned an invalid tenant scope')
  }
  if (data.balancesTruncated) {
    throw new Error('Inventory summary exceeds the display limit')
  }

  return {
    uoms: data.uoms.map((uom) => ({
      id: uom.id,
      code: uom.code,
      name: uom.name,
      decimal_places: uom.decimalPlaces,
      is_active: uom.isActive,
    })),
    warehouseRows: data.warehouses.map((warehouse) => ({
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      project_id: warehouse.projectId,
      is_active: warehouse.isActive,
    })),
    items: data.items.map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      base_uom_id: item.baseUomId,
      inventory_tracked: item.inventoryTracked,
      is_active: item.isActive,
    })),
    projectRows: data.projects.map((project) => ({
      id: project.id,
      code: project.name,
      name: project.name,
    })),
    balances: data.balances.map((balance) => ({
      warehouse_id: balance.warehouseId,
      warehouse_code: balance.warehouseCode,
      warehouse_name: balance.warehouseName,
      item_id: balance.itemId,
      item_code: balance.itemCode,
      item_description: balance.itemDescription,
      uom_code: balance.uomCode,
      quantity_micros: integerToSafeNumber(
        balance.quantityMicros,
        'quantity'
      ),
      value_cents: integerToSafeNumber(balance.valueCents, 'value'),
    })),
    receiptCounts: {
      draft_count: data.receiptCounts.draftCount,
      posted_count: data.receiptCounts.postedCount,
    },
  }
}

async function readLegacyInventorySummary(
  tenantId: string
): Promise<InventorySummaryPageData> {
  const [uoms, warehouseRows, items, projectRows, balanceRows, counts] =
    await Promise.all([
      db
        .select({
          id: unitsOfMeasure.id,
          code: unitsOfMeasure.code,
          name: unitsOfMeasure.name,
          decimal_places: unitsOfMeasure.decimal_places,
          is_active: unitsOfMeasure.is_active,
        })
        .from(unitsOfMeasure)
        .where(eq(unitsOfMeasure.tenant_id, tenantId))
        .orderBy(asc(unitsOfMeasure.code))
        .limit(MAX_UOMS + 1),
      db
        .select({
          id: warehouses.id,
          code: warehouses.code,
          name: warehouses.name,
          project_id: warehouses.project_id,
          is_active: warehouses.is_active,
        })
        .from(warehouses)
        .where(eq(warehouses.tenant_id, tenantId))
        .orderBy(asc(warehouses.code))
        .limit(MAX_WAREHOUSES + 1),
      db
        .select({
          id: materialItems.id,
          code: materialItems.code,
          description: materialItems.description,
          base_uom_id: materialItems.base_uom_id,
          inventory_tracked: materialItems.inventory_tracked,
          is_active: materialItems.is_active,
        })
        .from(materialItems)
        .where(eq(materialItems.tenant_id, tenantId))
        .orderBy(asc(materialItems.code))
        .limit(MAX_ITEMS + 1),
      db
        .select({
          id: projects.id,
          code: projects.name,
          name: projects.name,
        })
        .from(projects)
        .where(eq(projects.tenant_id, tenantId))
        .orderBy(asc(projects.name))
        .limit(MAX_PROJECTS + 1),
      db.execute<{
        [key: string]: unknown
        warehouse_id: string
        warehouse_code: string
        warehouse_name: string
        item_id: string
        item_code: string
        item_description: string
        uom_code: string
        quantity_micros: string | number | bigint
        value_cents: string | number | bigint
      }>(sql`
        select
          warehouse.id as warehouse_id,
          warehouse.code as warehouse_code,
          warehouse.name as warehouse_name,
          item.id as item_id,
          item.code as item_code,
          item.description as item_description,
          uom.code as uom_code,
          sum(stock.quantity_delta_micros)::bigint as quantity_micros,
          sum(stock.value_delta_cents)::bigint as value_cents
        from public.stock_ledger_entries stock
        join public.warehouses warehouse
          on warehouse.id = stock.warehouse_id
         and warehouse.tenant_id = stock.tenant_id
        join public.material_items item
          on item.id = stock.material_item_id
         and item.tenant_id = stock.tenant_id
        join public.units_of_measure uom
          on uom.id = stock.uom_id
         and uom.tenant_id = stock.tenant_id
        where stock.tenant_id = ${tenantId}::uuid
        group by
          warehouse.id,
          warehouse.code,
          warehouse.name,
          item.id,
          item.code,
          item.description,
          uom.code
        having sum(stock.quantity_delta_micros) <> 0
        order by warehouse.code, item.code
        limit ${MAX_BALANCES + 1}
      `),
      db.execute<{
        [key: string]: unknown
        draft_count: number | string | bigint
        posted_count: number | string | bigint
      }>(sql`
        select
          count(*) filter (where status = 'draft')::integer as draft_count,
          count(*) filter (where status = 'posted')::integer as posted_count
        from public.stock_receipts
        where tenant_id = ${tenantId}::uuid
      `),
    ])

  if (
    uoms.length > MAX_UOMS ||
    warehouseRows.length > MAX_WAREHOUSES ||
    items.length > MAX_ITEMS ||
    projectRows.length > MAX_PROJECTS
  ) {
    throw new Error('Inventory setup data exceeds the display limit')
  }
  if (balanceRows.length > MAX_BALANCES) {
    throw new Error('Inventory summary exceeds the display limit')
  }

  return {
    uoms,
    warehouseRows,
    items,
    projectRows,
    balances: balanceRows.map((row) => ({
      warehouse_id: row.warehouse_id,
      warehouse_code: row.warehouse_code,
      warehouse_name: row.warehouse_name,
      item_id: row.item_id,
      item_code: row.item_code,
      item_description: row.item_description,
      uom_code: row.uom_code,
      quantity_micros: integerToSafeNumber(row.quantity_micros, 'quantity'),
      value_cents: integerToSafeNumber(row.value_cents, 'value'),
    })),
    receiptCounts: {
      draft_count: integerToSafeNumber(counts[0]?.draft_count ?? 0, 'draft receipt count'),
      posted_count: integerToSafeNumber(counts[0]?.posted_count ?? 0, 'posted receipt count'),
    },
  }
}

export async function getInventorySummary(
  tenantId: string
): Promise<InventorySummaryPageData> {
  if (inventorySummaryReadsUseCoreApi(tenantId)) {
    const result = await getInventorySummaryThroughCoreApi()
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Inventory summary was not read')
    }
    return mapCoreSummary(tenantId, result.data)
  }

  return readLegacyInventorySummary(tenantId)
}
