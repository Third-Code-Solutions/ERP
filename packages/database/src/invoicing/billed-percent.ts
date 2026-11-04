import { and, eq, isNull, ne, sql, type SQL } from 'drizzle-orm'
import type { Database } from '../client'
import { invoices } from '../schema/invoices'

/**
 * D-6 cumulative billing cap input, shared by the Core API draft service and
 * the legacy web invoice action. Every live invoice of the project counts,
 * including the award down-payment draft; cancelled or reversed ones do not.
 * Callers must hold the project row FOR UPDATE so concurrent drafts serialize.
 */
export function billedInvoicesCondition(
  tenantId: string,
  projectId: string
): SQL | undefined {
  return and(
    eq(invoices.tenant_id, tenantId),
    eq(invoices.project_id, projectId),
    ne(invoices.status, 'cancelled'),
    isNull(invoices.reversed_at)
  )
}

export async function billedPercentBps(
  executor: Pick<Database, 'select'>,
  tenantId: string,
  projectId: string
): Promise<number> {
  const [billed] = await executor
    .select({
      percentBps: sql<string>`coalesce(sum(${invoices.billing_percent_bps}), 0)::text`,
    })
    .from(invoices)
    .where(billedInvoicesCondition(tenantId, projectId))
  return Number(billed?.percentBps ?? 0)
}
