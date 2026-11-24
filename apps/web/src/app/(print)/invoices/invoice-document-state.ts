/**
 * What a printed invoice may claim to be. Only an issued, un-reversed invoice is
 * a valid document; the rest print with a state mark so nobody mistakes them
 * for one.
 */
export type InvoiceDocumentState = 'valid' | 'draft' | 'cancelled' | 'reversed'

export function invoiceDocumentState(invoice: {
  status: string | null | undefined
  reversed_at?: Date | string | null
}): InvoiceDocumentState {
  // A reversal keeps the invoice status, so it is read from reversed_at first.
  if (invoice.reversed_at) return 'reversed'
  if (invoice.status === 'draft') return 'draft'
  if (invoice.status === 'cancelled') return 'cancelled'
  return 'valid'
}

/** Banner and watermark text; null for a valid invoice. */
export function invoiceStateMark(state: InvoiceDocumentState): string | null {
  switch (state) {
    case 'draft':
      return 'DRAFT'
    case 'cancelled':
      return 'CANCELLED'
    case 'reversed':
      return 'REVERSED'
    case 'valid':
      return null
  }
}

export function invoiceStateNotice(state: InvoiceDocumentState): string | null {
  switch (state) {
    case 'draft':
      return 'Not yet issued. This is not a valid invoice and has no legal effect.'
    case 'cancelled':
      return 'This invoice was cancelled and is not a valid invoice.'
    case 'reversed':
      return 'This invoice was reversed and is not a valid invoice.'
    case 'valid':
      return null
  }
}

/** A draft or cancelled invoice has no withholding to certify. */
export function bir2307Available(state: InvoiceDocumentState): boolean {
  return state !== 'draft' && state !== 'cancelled'
}
