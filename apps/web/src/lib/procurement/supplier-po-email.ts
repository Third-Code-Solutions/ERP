import 'server-only'

import { db } from '@third-code-erp/database'
import { poLineItems, purchaseOrders } from '@third-code-erp/database/schema'
import { and, asc, eq } from 'drizzle-orm'
import { notifyExternalEmail } from '@/lib/operations/notifications'
import {
  formatPoEmailLines,
  supplierEmailTarget,
  type SupplierEmailOutcome,
} from './supplier-email-outcome'

/** A PO has a handful of lines; the cap only bounds a malformed one. */
const EMAIL_LINE_LIMIT = 200

export interface SupplierPoEmailInput {
  tenantId: string
  poId: string
  poNumber: string
  totalCents: number
  vendorId: string | null
  supplierName: string | null
  supplierEmail: string | null
}

/**
 * Email an issued Purchase Order, with its lines, to the supplier. The email is
 * best effort: the PO is already issued, so this never throws, and the caller
 * is told what happened. `supplier_email_sent_at` is stamped only on a real
 * delivery, so a failed send can be retried.
 */
export async function sendSupplierPoEmail(
  input: SupplierPoEmailInput
): Promise<SupplierEmailOutcome> {
  const target = supplierEmailTarget(input)
  if (target !== 'ready') return target
  if (!input.supplierEmail || !input.supplierName) return 'no_email'

  try {
    const lines = await db
      .select({
        code: poLineItems.code,
        description: poLineItems.description,
        unit: poLineItems.unit,
        quantityMicros: poLineItems.quantity_micros,
        unitCostCents: poLineItems.unit_cost_cents,
        lineTotalCents: poLineItems.line_total_cents,
      })
      .from(poLineItems)
      .where(
        and(
          eq(poLineItems.po_id, input.poId),
          eq(poLineItems.tenant_id, input.tenantId)
        )
      )
      .orderBy(asc(poLineItems.sort_order))
      .limit(EMAIL_LINE_LIMIT)

    const delivery = await notifyExternalEmail({
      tenantId: input.tenantId,
      recipientEmail: input.supplierEmail,
      subject: `Purchase order ${input.poNumber}`,
      templateId: 'po-issued',
      templateVars: {
        po_number: input.poNumber,
        total_php: (input.totalCents / 100).toLocaleString('en-PH', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        supplier_name: input.supplierName,
        lines_text: formatPoEmailLines(lines),
      },
    })
    if (!delivery.delivered) return 'provider_error'
  } catch (error) {
    console.error('PO supplier email dispatch failed', error)
    return 'provider_error'
  }

  try {
    const now = new Date()
    await db
      .update(purchaseOrders)
      .set({ supplier_email_sent_at: now, updated_at: now })
      .where(
        and(
          eq(purchaseOrders.id, input.poId),
          eq(purchaseOrders.tenant_id, input.tenantId)
        )
      )
  } catch (error) {
    // The message went out. Do not report a failure and invite a duplicate send.
    console.error('PO supplier email evidence stamp failed', error)
  }
  return 'sent'
}
