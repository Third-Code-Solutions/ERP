import {
  claimInvoiceAmountMismatch,
  isClaimLinkableInvoiceStatus,
} from '@third-code-erp/shared-types'

export interface ClaimLinkInvoice {
  id: string
  invoice_number: string
  status: string
  reversed: boolean
  subtotal_cents: number
  /** Number of the live claim already holding this invoice, if any. */
  linked_claim_number: string | null
}

export interface ClaimLinkOption extends ClaimLinkInvoice {
  linkable: boolean
  /** Why the invoice cannot be linked; null when it can. */
  reason: string | null
}

function statusReason(invoice: ClaimLinkInvoice): string | null {
  if (invoice.reversed) return 'reversed'
  if (invoice.status === 'draft') return 'still a draft'
  if (!isClaimLinkableInvoiceStatus(invoice.status)) return invoice.status.replace(/_/g, ' ')
  if (invoice.linked_claim_number) return `already on claim ${invoice.linked_claim_number}`
  return null
}

/** One picker row: linkable only when Core would accept it and the amounts agree. */
export function claimLinkOption(
  claimAmountCents: number,
  invoice: ClaimLinkInvoice
): ClaimLinkOption {
  const blocked = statusReason(invoice)
  if (blocked) return { ...invoice, linkable: false, reason: blocked }
  const mismatch = claimInvoiceAmountMismatch(claimAmountCents, invoice.subtotal_cents)
  if (mismatch) return { ...invoice, linkable: false, reason: 'amount differs from the claim' }
  return { ...invoice, linkable: true, reason: null }
}

export const CLAIM_PAID_IN_FULL = 'Paid in full'

/** The claim's payment state, derived from the receipts posted against its linked invoice. */
export function claimPaymentLabel(invoice: { status: string; reversed: boolean }): string {
  if (invoice.reversed) return 'Invoice reversed'
  if (invoice.status === 'cancelled') return 'Invoice cancelled'
  if (invoice.status === 'paid') return CLAIM_PAID_IN_FULL
  if (invoice.status === 'partial_payment') return 'Partially paid'
  return 'Awaiting payment'
}

/**
 * A claim reaches `paid` at its first receipt, so for a paid claim the reader
 * sees its linked invoice's payment state instead. Null for any other claim.
 */
export function paidClaimPaymentLabel(claim: {
  status: string
  invoice_status: string | null
  invoice_reversed_at: Date | null
}): string | null {
  if (claim.status !== 'paid' || claim.invoice_status === null) return null
  return claimPaymentLabel({
    status: claim.invoice_status,
    reversed: claim.invoice_reversed_at !== null,
  })
}
