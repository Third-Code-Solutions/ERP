/** Invoices that count as billed. Drafts are not yet billed and cancelled ones never were. */
export const BILLED_INVOICE_STATUSES = ['issued', 'partial_payment', 'paid', 'overdue'] as const

export function isBilledInvoiceStatus(status: string): boolean {
  return (BILLED_INVOICE_STATUSES as readonly string[]).includes(status)
}

export interface InvoiceCollectionRow {
  id: string
  status: string
  net_amount_cents: number
}

export interface InvoiceCollectionTotals {
  invoiced: number
  paid: number
  outstanding: number
}

/**
 * Paid is what posted cash receipts have settled per invoice, so partial
 * payments count. An invoice marked paid without receipt lines counts in full.
 * Rows that are not billed are ignored.
 */
export function invoiceCollectionTotals(
  rows: readonly InvoiceCollectionRow[],
  receivedCentsByInvoice: ReadonlyMap<string, number>,
): InvoiceCollectionTotals {
  let invoiced = 0
  let paid = 0
  for (const row of rows) {
    if (!isBilledInvoiceStatus(row.status)) continue
    invoiced += row.net_amount_cents
    const received = Math.min(row.net_amount_cents, receivedCentsByInvoice.get(row.id) ?? 0)
    paid += row.status === 'paid' ? row.net_amount_cents : received
  }
  return { invoiced, paid, outstanding: Math.max(0, invoiced - paid) }
}
