import { and, eq, sql } from 'drizzle-orm'
import { accounts, invoices, projects } from '@third-code-erp/database/schema'
import { formatBps } from '@third-code-erp/shared-types'

/** Join condition for the account an invoice bills: its own, else its project's, in this tenant. */
export function invoiceClientAccountJoin(tenantId: string) {
  return and(
    eq(accounts.id, sql`coalesce(${invoices.account_id}, ${projects.account_id})`),
    eq(accounts.tenant_id, tenantId),
  )
}

interface WithholdingAmounts {
  subtotal_cents: number
  retention_cents: number
  withholding_tax_cents: number
}

/** EWT base: gross billing less retention, which the client still holds. */
export function withholdingTaxBaseCents(inv: Omit<WithholdingAmounts, 'withholding_tax_cents'>): number {
  return Math.max(0, inv.subtotal_cents - inv.retention_cents)
}

/**
 * EWT rate actually withheld on this invoice, read from its stored amounts: the
 * tenant's tax profile may differ from the default rate.
 */
export function withholdingRateLabel(inv: WithholdingAmounts): string {
  const base = withholdingTaxBaseCents(inv)
  if (base === 0) return '—'
  const bps = Math.round((inv.withholding_tax_cents * 10_000) / base)
  return bps >= 0 && bps <= 10_000 ? formatBps(bps) : '—'
}
