export type JournalReversalRoute =
  | { kind: 'manual' }
  | { kind: 'workflow'; document: string; href: string | null }

interface OwningWorkflow {
  document: string
  href: (referenceId: string) => string
}

const OWNING_WORKFLOWS: Record<string, OwningWorkflow> = {
  customer_invoice: {
    document: 'customer invoice',
    href: (id) => `/invoices/${id}`,
  },
  supplier_bill: {
    document: 'supplier bill',
    href: (id) => `/finance/payables/${id}`,
  },
  cash_transaction: {
    document: 'cash transaction',
    href: (id) => `/finance/cash/${id}`,
  },
  stock_receipt: {
    document: 'stock receipt',
    href: (id) => `/inventory/receipts/${id}`,
  },
  stock_movement: {
    document: 'stock movement',
    href: (id) => `/inventory/movements/${id}`,
  },
}

/**
 * Only manual journals can be reversed here. A journal written by an invoice,
 * bill, cash or stock document must be reversed from that document: the
 * database refuses a direct reversal, so offering one only ends in an error.
 */
export function journalReversalRoute(entry: {
  sourceType: 'manual' | 'system' | 'reversal'
  referenceType: string | null
  referenceId: string | null
}): JournalReversalRoute {
  if (entry.sourceType === 'manual') return { kind: 'manual' }
  const workflow = entry.referenceType
    ? OWNING_WORKFLOWS[entry.referenceType]
    : undefined
  if (!workflow) return { kind: 'workflow', document: 'source document', href: null }
  return {
    kind: 'workflow',
    document: workflow.document,
    href: entry.referenceId ? workflow.href(entry.referenceId) : null,
  }
}
