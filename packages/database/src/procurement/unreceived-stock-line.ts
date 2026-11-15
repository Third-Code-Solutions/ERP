import { and, eq, exists, isNotNull, lt, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { materialItems, poLineItems } from '../schema'

/**
 * The PO has a stock-tracked line not yet received in full. Only such lines can
 * take a Stock Receipt (`guard_stock_receipt_line` needs a tracked Item and a
 * UOM), and posting never moves PO status, so these are the lines a PO marked
 * delivered must already have received. Lines that cannot be received do not
 * count.
 */
export function unreceivedStockLineCondition(
  purchaseOrderId: string | SQLWrapper,
  tenantId: string | SQLWrapper
): SQL {
  return exists(
    new QueryBuilder()
      .select({ one: sql`1` })
      .from(poLineItems)
      .innerJoin(
        materialItems,
        and(
          eq(materialItems.id, poLineItems.material_item_id),
          eq(materialItems.tenant_id, poLineItems.tenant_id)
        )
      )
      .where(
        and(
          eq(poLineItems.po_id, purchaseOrderId),
          eq(poLineItems.tenant_id, tenantId),
          isNotNull(poLineItems.uom_id),
          eq(materialItems.inventory_tracked, true),
          lt(poLineItems.received_quantity_micros, poLineItems.quantity_micros)
        )
      )
  )
}
