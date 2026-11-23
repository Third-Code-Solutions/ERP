/**
 * What the client billing portal may show. The portal is for the client, so it
 * lists only documents the contractor has actually issued or submitted: not
 * drafts, cancelled or reversed invoices, and not internal claims.
 */
export const PORTAL_INVOICE_STATUSES: Array<
  'issued' | 'partial_payment' | 'paid' | 'overdue'
> = ['issued', 'partial_payment', 'paid', 'overdue']

export const PORTAL_CLAIM_STATUSES: Array<
  | 'submitted'
  | 'certificate_pending'
  | 'certified'
  | 'handed_over_finance'
  | 'invoiced'
  | 'paid'
> = [
  'submitted',
  'certificate_pending',
  'certified',
  'handed_over_finance',
  'invoiced',
  'paid',
]

export interface PortalInvoiceAmount {
  id: string
  status: string
  net_amount_cents: number
}

export interface PortalBillingTotals {
  invoicedCents: number
  paidCents: number
  outstandingCents: number
}

/**
 * Invoiced, paid and outstanding for the listed invoices. `receivedByInvoice`
 * holds the posted current-due receipts per invoice, so a part-paid invoice
 * counts only its unpaid balance as outstanding. An invoice Finance marked
 * `paid` is settled even when no receipt is allocated to it.
 */
export function portalBillingTotals(
  invoices: readonly PortalInvoiceAmount[],
  receivedByInvoice: ReadonlyMap<string, number>
): PortalBillingTotals {
  let invoicedCents = 0
  let paidCents = 0
  for (const invoice of invoices) {
    const net = invoice.net_amount_cents
    const received = receivedByInvoice.get(invoice.id) ?? 0
    const paid = invoice.status === 'paid' ? net : Math.min(Math.max(received, 0), net)
    invoicedCents += net
    paidCents += paid
  }
  return {
    invoicedCents,
    paidCents,
    outstandingCents: invoicedCents - paidCents,
  }
}
