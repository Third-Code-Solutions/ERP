/**
 * Confirmation text for finance actions that write permanent ledger or
 * reconciliation evidence. Every message states that it cannot be undone.
 */
export const IRREVERSIBLE_CONFIRMATIONS = {
  postJournal:
    'Post this journal? Posting locks every line and cannot be undone. A mistake can only be corrected with a separate reversal entry.',
  reverseJournal:
    'Post this reversal? It creates an equal-and-opposite entry, cannot be undone, and the original entry cannot be reversed again.',
  postSupplierBill:
    'Post this supplier bill? It books the payable in the ledger and cannot be undone. A mistake can only be corrected by reversing the bill.',
  reverseSupplierBill:
    'Reverse this supplier bill? It posts an equal-and-opposite journal and cannot be undone.',
  postCashTransaction:
    'Post this cash transaction? It books the cash movement in the ledger and cannot be undone. A mistake can only be corrected by reversing it.',
  reverseCashTransaction:
    'Reverse this cash transaction? It posts an equal-and-opposite journal and cannot be undone.',
  reconcileStatement:
    'Reconcile this statement? Every line and its matched cash evidence are locked and this cannot be undone.',
  voidStatement:
    'Void this reconciled statement? Voiding cannot be undone. Its lines and matches stay on record as historical evidence.',
} as const
