import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import type { PayableEvidenceOption } from './payable-form'

interface EvidenceRow extends Record<string, unknown> {
  purchase_order_id: string
  po_line_item_id: string
  description: string
  cost_code: string
  inventory_tracked: boolean
  stock_receipt_line_id: string | null
  receipt_number: string | null
  uom_code: string | null
  remaining_quantity_micros: number | string | null
  unit_cost_cents: number | string | null
  remaining_amount_cents: number | string
}

export async function loadPayableEvidence(
  tenantId: string
): Promise<PayableEvidenceOption[]> {
  const rows = await db.execute<EvidenceRow>(sql`
    with posted_bill_usage as (
      select
        bill_line.po_line_item_id,
        bill_line.stock_receipt_line_id,
        coalesce(sum(bill_line.quantity_micros), 0)::bigint
          as matched_quantity_micros,
        coalesce(sum(bill_line.amount_cents), 0)::bigint
          as matched_amount_cents
      from public.supplier_bill_lines bill_line
      join public.supplier_bills bill
        on bill.id = bill_line.supplier_bill_id
       and bill.tenant_id = bill_line.tenant_id
      where bill_line.tenant_id = ${tenantId}::uuid
        and bill.status = 'posted'
      group by
        bill_line.po_line_item_id,
        bill_line.stock_receipt_line_id
    )
    select
      po_line.po_id as purchase_order_id,
      po_line.id as po_line_item_id,
      po_line.description,
      coalesce(cost_code.code, 'NO-CODE') as cost_code,
      coalesce(item.inventory_tracked, false) as inventory_tracked,
      receipt_line.id as stock_receipt_line_id,
      coalesce(receipt.internal_number, receipt.supplier_delivery_reference)
        as receipt_number,
      uom.code as uom_code,
      case
        when coalesce(item.inventory_tracked, false)
          then receipt_line.quantity_micros
            - coalesce(usage.matched_quantity_micros, 0)
        else null
      end as remaining_quantity_micros,
      receipt_line.unit_cost_cents,
      case
        when coalesce(item.inventory_tracked, false)
          then receipt_line.line_total_cents
            - coalesce(usage.matched_amount_cents, 0)
        else po_line.line_total_cents
            - coalesce(usage.matched_amount_cents, 0)
      end as remaining_amount_cents
    from public.po_line_items po_line
    left join public.material_items item
      on item.id = po_line.material_item_id
     and item.tenant_id = po_line.tenant_id
    left join public.cost_codes cost_code
      on cost_code.id = po_line.cost_code_id
     and cost_code.tenant_id = po_line.tenant_id
    left join public.stock_receipt_lines receipt_line
      on receipt_line.po_line_item_id = po_line.id
     and receipt_line.tenant_id = po_line.tenant_id
     and coalesce(item.inventory_tracked, false)
    left join public.stock_receipts receipt
      on receipt.id = receipt_line.stock_receipt_id
     and receipt.tenant_id = receipt_line.tenant_id
     and receipt.status = 'posted'
    left join public.units_of_measure uom
      on uom.id = receipt_line.uom_id
     and uom.tenant_id = receipt_line.tenant_id
    left join posted_bill_usage usage
      on usage.po_line_item_id = po_line.id
     and usage.stock_receipt_line_id is not distinct from receipt_line.id
    where po_line.tenant_id = ${tenantId}::uuid
      and (
        (
          coalesce(item.inventory_tracked, false)
          and receipt.id is not null
          and receipt_line.quantity_micros
            > coalesce(usage.matched_quantity_micros, 0)
        ) or (
          not coalesce(item.inventory_tracked, false)
          and po_line.line_total_cents
            > coalesce(usage.matched_amount_cents, 0)
        )
      )
    order by po_line.po_id, po_line.sort_order, receipt.received_date,
      receipt_line.line_number
  `)

  return rows.map((row) => ({
    purchaseOrderId: row.purchase_order_id,
    poLineItemId: row.po_line_item_id,
    description: row.description,
    costCode: row.cost_code,
    inventoryTracked: row.inventory_tracked,
    stockReceiptLineId: row.stock_receipt_line_id,
    receiptNumber: row.receipt_number,
    uomCode: row.uom_code,
    remainingQuantityMicros:
      row.remaining_quantity_micros == null
        ? null
        : Number(row.remaining_quantity_micros),
    unitCostCents:
      row.unit_cost_cents == null ? null : Number(row.unit_cost_cents),
    remainingAmountCents: Number(row.remaining_amount_cents),
  }))
}
