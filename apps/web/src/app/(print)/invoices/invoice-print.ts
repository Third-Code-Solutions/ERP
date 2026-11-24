import { and, eq, sql } from 'drizzle-orm'
import { db, resolveTaxRates } from '@third-code-erp/database'
import { accounts, invoices, projects } from '@third-code-erp/database/schema'
import { TaxProfileOverlapError, formatBps } from '@third-code-erp/shared-types'

/** Join condition for the account an invoice bills: its own, else its project's, in this tenant. */
export function invoiceClientAccountJoin(tenantId: string) {
  return and(
    eq(accounts.id, sql`coalesce(${invoices.account_id}, ${projects.account_id})`),
    eq(accounts.tenant_id, tenantId),
  )
}

interface TaxBaseAmounts {
  subtotal_cents: number
  /** A purchase order has none. */
  retention_cents?: number
}

/** VAT and EWT base: gross billing less retention, which the client still holds. */
export function invoiceTaxBaseCents(inv: TaxBaseAmounts): number {
  return Math.max(0, inv.subtotal_cents - (inv.retention_cents ?? 0))
}

/** A stored tax amount over its base, as a rate rounded to whole basis points. */
function storedRateLabel(amountCents: number, baseCents: number): string {
  if (baseCents === 0) return '—'
  const bps = Math.round((amountCents * 10_000) / baseCents)
  return bps >= 0 && bps <= 10_000 ? formatBps(bps) : '—'
}

/**
 * EWT rate actually withheld on this invoice, read from its stored amounts: the
 * tenant's tax profile may differ from the default rate.
 */
export function withholdingRateLabel(inv: TaxBaseAmounts & { withholding_tax_cents: number }): string {
  return storedRateLabel(inv.withholding_tax_cents, invoiceTaxBaseCents(inv))
}

/**
 * VAT rate charged, from the stored amounts. A zero VAT on a non-VAT tenant's
 * invoice reads "Non-VAT"; any other zero prints "0%", because the schema
 * cannot tell an exempt sale from a zero-rated one. `vatRegistered` is null
 * when the profile was not read or could not be.
 */
export function vatRateLabel(
  inv: TaxBaseAmounts & { vat_cents: number },
  vatRegistered: boolean | null,
): string {
  const base = invoiceTaxBaseCents(inv)
  if (inv.vat_cents > 0) return storedRateLabel(inv.vat_cents, base)
  if (vatRegistered === false) return 'Non-VAT'
  return base === 0 ? '—' : '0%'
}

/**
 * Whether the tenant was VAT-registered under the tax profile in force when the
 * invoice was drafted (the date its rates were taken), or null when profiles overlap.
 */
export async function vatRegisteredWhenDrafted(tenantId: string, draftedAt: Date): Promise<boolean | null> {
  try {
    return (await resolveTaxRates(db, tenantId, draftedAt)).vatRegistered
  } catch (error) {
    if (error instanceof TaxProfileOverlapError) return null
    throw error
  }
}
