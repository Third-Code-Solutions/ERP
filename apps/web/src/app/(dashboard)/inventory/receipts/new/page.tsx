import type { Metadata } from 'next'
import Link from 'next/link'
import { requireCapability, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  deliverySchedules,
  materialItems,
  poLineItems,
  projects,
  purchaseOrders,
  unitsOfMeasure,
  vendors,
  warehouses,
} from '@third-code-erp/database/schema'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { StockReceiptForm } from '../../receipt-form'

export const metadata: Metadata = { title: 'New Stock Receipt' }

export default async function NewStockReceiptPage() {
  const profile = await requireUserProfile()
  requireCapability(profile, 'inventory.manage')

  const [poRows, lineRows, warehouseRows, deliveryRows] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.po_number,
        projectId: purchaseOrders.project_id,
        projectCode: projects.name,
        projectName: projects.name,
        vendorName: vendors.name,
      })
      .from(purchaseOrders)
      .innerJoin(
        projects,
        and(
          eq(projects.id, purchaseOrders.project_id),
          eq(projects.tenant_id, purchaseOrders.tenant_id)
        )
      )
      .leftJoin(
        vendors,
        and(
          eq(vendors.id, purchaseOrders.vendor_id),
          eq(vendors.tenant_id, purchaseOrders.tenant_id)
        )
      )
      .where(
        and(
          eq(purchaseOrders.tenant_id, profile.tenantId),
          inArray(purchaseOrders.status, [
            'issued',
            'confirmed',
            'partial_delivery',
            'delivered',
            'fully_delivered',
          ])
        )
      )
      .orderBy(asc(purchaseOrders.po_number))
      .limit(250),
    db
      .select({
        id: poLineItems.id,
        purchaseOrderId: poLineItems.po_id,
        code: poLineItems.code,
        description: poLineItems.description,
        uom: unitsOfMeasure.code,
        orderedMicros: poLineItems.quantity_micros,
        receivedMicros: poLineItems.received_quantity_micros,
        unitCostCents: poLineItems.unit_cost_cents,
        materialItemId: poLineItems.material_item_id,
        uomId: poLineItems.uom_id,
        tracked: materialItems.inventory_tracked,
        itemActive: materialItems.is_active,
        uomActive: unitsOfMeasure.is_active,
      })
      .from(poLineItems)
      .innerJoin(
        purchaseOrders,
        and(
          eq(purchaseOrders.id, poLineItems.po_id),
          eq(purchaseOrders.tenant_id, poLineItems.tenant_id)
        )
      )
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
      .where(
        and(
          eq(poLineItems.tenant_id, profile.tenantId),
          inArray(purchaseOrders.status, [
            'issued',
            'confirmed',
            'partial_delivery',
            'delivered',
            'fully_delivered',
          ])
        )
      )
      .orderBy(asc(poLineItems.po_id), asc(poLineItems.sort_order))
      .limit(2_000),
    db
      .select({
        id: warehouses.id,
        code: warehouses.code,
        name: warehouses.name,
        projectId: warehouses.project_id,
      })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenant_id, profile.tenantId),
          eq(warehouses.is_active, true)
        )
      )
      .orderBy(asc(warehouses.code)),
    db
      .select({
        id: deliverySchedules.id,
        purchaseOrderId: deliverySchedules.purchase_order_id,
        scheduledDate: deliverySchedules.scheduled_date,
      })
      .from(deliverySchedules)
      .where(
        and(
          eq(deliverySchedules.tenant_id, profile.tenantId),
          eq(deliverySchedules.status, 'accepted')
        )
      )
      .orderBy(asc(deliverySchedules.scheduled_date)),
  ])

  return (
    <div>
      <div className="finance-breadcrumb">
        <Link href="/inventory/receipts">Stock Receipts</Link>
        <span>/</span>
        <span>New receipt</span>
      </div>
      <div className="page-header finance-page-header">
        <div>
          <p className="finance-eyebrow">Controlled receiving</p>
          <h1 className="page-title">New Stock Receipt</h1>
          <p className="page-subtitle">
            Record accepted quantities against one issued Purchase Order.
            Finance posts the reviewed draft into stock and accounting.
          </p>
        </div>
      </div>

      {poRows.length === 0 || warehouseRows.length === 0 ? (
        <section className="finance-section">
          <div className="card-empty">
            <p>
              An issued Purchase Order and active compatible Warehouse are
              required.
            </p>
            <Link href="/inventory">Open Inventory setup</Link>
          </div>
        </section>
      ) : (
        <StockReceiptForm
          purchaseOrders={poRows.map((po) => ({
            id: po.id,
            number: po.number,
            projectId: po.projectId,
            projectLabel: `${po.projectCode} / ${po.projectName}`,
            vendorLabel: po.vendorName ?? 'Supplier not set',
          }))}
          lines={lineRows.map((line) => ({
            id: line.id,
            purchaseOrderId: line.purchaseOrderId,
            code: line.code,
            description: line.description,
            uom: line.uom,
            orderedMicros: line.orderedMicros,
            receivedMicros: line.receivedMicros,
            unitCostCents: line.unitCostCents,
            ready: Boolean(
              line.materialItemId &&
                line.uomId &&
                line.tracked &&
                line.itemActive &&
                line.uomActive
            ),
          }))}
          warehouses={warehouseRows}
          deliveries={deliveryRows.map((delivery) => ({
            ...delivery,
            scheduledDate: delivery.scheduledDate?.toISOString() ?? null,
          }))}
          today={new Date().toISOString().slice(0, 10)}
        />
      )}
    </div>
  )
}
