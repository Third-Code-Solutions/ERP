import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import { cashAllocations, cashTransactions } from '@third-code-erp/database/schema'

/**
 * Posted receipts applied to each invoice's current due, in cents. Retention
 * releases are settled separately and are not counted here.
 */
export async function loadPostedReceiptsByInvoice(
  tenantId: string,
  invoiceIds: readonly string[],
): Promise<Map<string, number>> {
  if (invoiceIds.length === 0) return new Map()
  const rows = await db
    .select({
      invoice_id: cashAllocations.invoice_id,
      cents: sql<string>`coalesce(sum(${cashAllocations.amount_cents}), 0)`,
    })
    .from(cashAllocations)
    .innerJoin(
      cashTransactions,
      and(
        eq(cashTransactions.id, cashAllocations.cash_transaction_id),
        eq(cashTransactions.tenant_id, cashAllocations.tenant_id),
        eq(cashTransactions.status, 'posted'),
      ),
    )
    .where(
      and(
        eq(cashAllocations.tenant_id, tenantId),
        eq(cashAllocations.allocation_type, 'customer_current_due'),
        inArray(cashAllocations.invoice_id, [...invoiceIds]),
      ),
    )
    .groupBy(cashAllocations.invoice_id)
  return new Map(
    rows.flatMap((r) => (r.invoice_id ? [[r.invoice_id, Number(r.cents)] as const] : [])),
  )
}
