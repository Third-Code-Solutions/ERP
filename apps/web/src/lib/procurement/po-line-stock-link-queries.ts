import 'server-only'

import { db } from '@third-code-erp/database'
import {
  materialItems,
  poLineItems,
  stockReceiptLines,
  unitsOfMeasure,
} from '@third-code-erp/database/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { poLineStockReadiness } from './po-line-stock-link'

/** Items a buyer can pick on the PO page; a tenant's tracked catalog is small. */
const PICKER_LIMIT = 500

export interface PoLineStockLinkView {
  itemCode: string | null
  unitCode: string | null
  /** Why the line cannot be received; null when it can. */
  reason: string | null
  /** A Stock Receipt line exists, so the item and unit are frozen. */
  frozen: boolean
}

export interface StockItemChoice {
  id: string
  code: string
  description: string
  unit: string
}

/** Stock link state of every line of one PO, tenant-scoped. */
export async function loadPoLineStockLinks(input: {
  tenantId: string
  poId: string
  lineIds: string[]
  withPicker: boolean
}): Promise<{ byLine: Map<string, PoLineStockLinkView>; items: StockItemChoice[] }> {
  const { tenantId, poId, lineIds } = input
  const byLine = new Map<string, PoLineStockLinkView>()
  if (lineIds.length === 0) return { byLine, items: [] }

  const itemUom = alias(unitsOfMeasure, 'item_uom')
  const [rows, receipted] = await Promise.all([
    db
      .select({
        lineId: poLineItems.id,
        materialItemId: poLineItems.material_item_id,
        uomId: poLineItems.uom_id,
        itemCode: materialItems.code,
        itemActive: materialItems.is_active,
        itemTracked: materialItems.inventory_tracked,
        itemBaseUomId: materialItems.base_uom_id,
        itemBaseUomCode: itemUom.code,
        uomCode: unitsOfMeasure.code,
        uomActive: unitsOfMeasure.is_active,
      })
      .from(poLineItems)
      .leftJoin(
        materialItems,
        and(
          eq(materialItems.id, poLineItems.material_item_id),
          eq(materialItems.tenant_id, poLineItems.tenant_id)
        )
      )
      .leftJoin(
        unitsOfMeasure,
        and(
          eq(unitsOfMeasure.id, poLineItems.uom_id),
          eq(unitsOfMeasure.tenant_id, poLineItems.tenant_id)
        )
      )
      .leftJoin(
        itemUom,
        and(
          eq(itemUom.id, materialItems.base_uom_id),
          eq(itemUom.tenant_id, poLineItems.tenant_id)
        )
      )
      .where(
        and(eq(poLineItems.po_id, poId), eq(poLineItems.tenant_id, tenantId))
      ),
    db
      .select({ lineId: stockReceiptLines.po_line_item_id })
      .from(stockReceiptLines)
      .where(
        and(
          eq(stockReceiptLines.tenant_id, tenantId),
          inArray(stockReceiptLines.po_line_item_id, lineIds)
        )
      ),
  ])
  const frozen = new Set(receipted.map((row) => row.lineId))
  for (const row of rows) {
    byLine.set(row.lineId, {
      itemCode: row.itemCode,
      unitCode: row.uomCode,
      reason: poLineStockReadiness({
        materialItemId: row.materialItemId,
        uomId: row.uomId,
        itemCode: row.itemCode,
        itemActive: row.itemActive,
        itemTracked: row.itemTracked,
        itemBaseUomId: row.itemBaseUomId,
        itemBaseUomCode: row.itemBaseUomCode,
        uomCode: row.uomCode,
        uomActive: row.uomActive,
      }).reason,
      frozen: frozen.has(row.lineId),
    })
  }

  const needsPicker =
    input.withPicker && [...byLine.values()].some((view) => view.reason)
  const items = needsPicker
    ? await db
        .select({
          id: materialItems.id,
          code: materialItems.code,
          description: materialItems.description,
          unit: materialItems.unit,
        })
        .from(materialItems)
        .where(
          and(
            eq(materialItems.tenant_id, tenantId),
            eq(materialItems.is_active, true),
            eq(materialItems.inventory_tracked, true)
          )
        )
        .orderBy(asc(materialItems.code))
        .limit(PICKER_LIMIT)
    : []
  return { byLine, items }
}
