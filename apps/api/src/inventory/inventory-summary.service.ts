import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import {
  materialItems,
  projects,
  unitsOfMeasure,
  warehouses,
} from '@third-code-erp/database/schema'
import {
  inventorySummaryResultSchema,
  type InventorySummaryResult,
} from '@third-code-erp/shared-types'
import { asc, eq, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

const MAX_UOMS = 500
const MAX_WAREHOUSES = 500
const MAX_ITEMS = 1_000
const MAX_PROJECTS = 500
const MAX_BALANCES = 500

interface BalanceRow {
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
}

interface ReceiptCountRow {
  [key: string]: unknown
  draft_count: string | number | bigint
  posted_count: string | number | bigint
}

@Injectable()
export class InventorySummaryService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async read(principal: ErpPrincipal): Promise<InventorySummaryResult> {
    const [uomRows, warehouseRows, itemRows, projectRows, balanceRows, countRows] =
      await Promise.all([
        this.database.client
          .select({
            id: unitsOfMeasure.id,
            code: unitsOfMeasure.code,
            name: unitsOfMeasure.name,
            decimalPlaces: unitsOfMeasure.decimal_places,
            isActive: unitsOfMeasure.is_active,
          })
          .from(unitsOfMeasure)
          .where(eq(unitsOfMeasure.tenant_id, principal.tenantId))
          .orderBy(asc(unitsOfMeasure.code))
          .limit(MAX_UOMS + 1),
        this.database.client
          .select({
            id: warehouses.id,
            code: warehouses.code,
            name: warehouses.name,
            projectId: warehouses.project_id,
            isActive: warehouses.is_active,
          })
          .from(warehouses)
          .where(eq(warehouses.tenant_id, principal.tenantId))
          .orderBy(asc(warehouses.code))
          .limit(MAX_WAREHOUSES + 1),
        this.database.client
          .select({
            id: materialItems.id,
            code: materialItems.code,
            description: materialItems.description,
            baseUomId: materialItems.base_uom_id,
            inventoryTracked: materialItems.inventory_tracked,
            isActive: materialItems.is_active,
          })
          .from(materialItems)
          .where(eq(materialItems.tenant_id, principal.tenantId))
          .orderBy(asc(materialItems.code))
          .limit(MAX_ITEMS + 1),
        this.database.client
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(eq(projects.tenant_id, principal.tenantId))
          .orderBy(asc(projects.name))
          .limit(MAX_PROJECTS + 1),
        this.database.client.execute<BalanceRow>(sql`
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
          where stock.tenant_id = ${principal.tenantId}::uuid
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
        this.database.client.execute<ReceiptCountRow>(sql`
          select
            count(*) filter (where status = 'draft')::integer as draft_count,
            count(*) filter (where status = 'posted')::integer as posted_count
          from public.stock_receipts
          where tenant_id = ${principal.tenantId}::uuid
        `),
      ])

    if (uomRows.length > MAX_UOMS) {
      throw new BadRequestException('Inventory UOM catalog exceeds the read limit')
    }
    if (warehouseRows.length > MAX_WAREHOUSES) {
      throw new BadRequestException('Inventory warehouse catalog exceeds the read limit')
    }
    if (itemRows.length > MAX_ITEMS) {
      throw new BadRequestException('Inventory item catalog exceeds the read limit')
    }
    if (projectRows.length > MAX_PROJECTS) {
      throw new BadRequestException('Inventory project catalog exceeds the read limit')
    }

    const balancesTruncated = balanceRows.length > MAX_BALANCES
    const balances = balanceRows.slice(0, MAX_BALANCES).map((row) => ({
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      warehouseName: row.warehouse_name,
      itemId: row.item_id,
      itemCode: row.item_code,
      itemDescription: row.item_description,
      uomCode: row.uom_code,
      quantityMicros: String(row.quantity_micros),
      valueCents: String(row.value_cents),
    }))
    const receiptCounts = countRows[0] ?? { draft_count: 0, posted_count: 0 }

    return inventorySummaryResultSchema.parse({
      tenantId: principal.tenantId,
      uoms: uomRows,
      warehouses: warehouseRows,
      items: itemRows,
      projects: projectRows,
      balances,
      balancesTruncated,
      receiptCounts: {
        draftCount: Number(receiptCounts.draft_count),
        postedCount: Number(receiptCounts.posted_count),
      },
    })
  }
}
