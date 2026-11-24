export const RECEIVABLE_MAPPINGS = [
  {
    key: 'accounts_receivable',
    label: 'Accounts Receivable',
    accountType: 'asset',
  },
  {
    key: 'retention_receivable',
    label: 'Retention Receivable',
    accountType: 'asset',
  },
  {
    key: 'withholding_tax_receivable',
    label: 'Withholding Tax Receivable',
    accountType: 'asset',
  },
  { key: 'revenue', label: 'Revenue', accountType: 'income' },
  {
    key: 'output_vat_payable',
    label: 'Output VAT Payable',
    accountType: 'liability',
  },
] as const

export const PAYABLE_MAPPINGS = [
  {
    key: 'accounts_payable',
    label: 'Accounts Payable',
    accountType: 'liability',
  },
  {
    key: 'input_vat_receivable',
    label: 'Input VAT Receivable',
    accountType: 'asset',
  },
  {
    key: 'withholding_tax_payable',
    label: 'Withholding Tax Payable',
    accountType: 'liability',
  },
] as const

export const INVENTORY_MAPPINGS = [
  { key: 'inventory', label: 'Inventory', accountType: 'asset' },
  {
    key: 'goods_received_not_invoiced',
    label: 'Goods Received Not Invoiced',
    accountType: 'liability',
  },
] as const

const EXPECTED_ACCOUNT_TYPES: ReadonlyMap<string, string> = new Map(
  [...RECEIVABLE_MAPPINGS, ...PAYABLE_MAPPINGS, ...INVENTORY_MAPPINGS].map(
    (mapping) => [mapping.key, mapping.accountType]
  )
)

/**
 * System keys held by an account of the type each mapping needs. The posting
 * functions also require the account_type, so a key on an account of another
 * type still counts as unmapped. Pass active accounts only.
 */
export function correctlyMappedSystemKeys(
  activeAccounts: ReadonlyArray<{
    system_key: string | null
    account_type: string
  }>
): Set<string> {
  return new Set(
    activeAccounts.flatMap((account) =>
      account.system_key &&
      EXPECTED_ACCOUNT_TYPES.get(account.system_key) === account.account_type
        ? [account.system_key]
        : []
    )
  )
}

const CASH_ACCOUNT_KIND_LABELS: Record<string, string> = {
  cash: 'Cash on hand',
  bank: 'Bank account',
  e_wallet: 'E-wallet',
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expense',
}

const NORMAL_BALANCE_LABELS: Record<string, string> = {
  debit: 'increases with debits',
  credit: 'increases with credits',
}

const JOURNAL_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual entry',
  system: 'System-generated',
  reversal: 'Reversal',
}

export function cashAccountKindLabel(kind: string): string {
  return CASH_ACCOUNT_KIND_LABELS[kind] ?? kind
}

export function ledgerAccountTypeLabel(
  accountType: string,
  normalBalance: string
): string {
  const type = ACCOUNT_TYPE_LABELS[accountType] ?? accountType
  const balance = NORMAL_BALANCE_LABELS[normalBalance] ?? normalBalance
  return `${type} · ${balance}`
}

export function journalSourceLabel(sourceType: string): string {
  return JOURNAL_SOURCE_LABELS[sourceType] ?? sourceType
}

export interface FinanceSetupState {
  activeAccountCount: number
  openPeriodCount: number
  activeCashAccountCount: number
  /** System keys on an active ledger account of the right type (correctlyMappedSystemKeys). */
  mappedSystemKeys: ReadonlySet<string>
}

function unmappedLabels(
  mappings: ReadonlyArray<{ key: string; label: string }>,
  mapped: ReadonlySet<string>
): string[] {
  return mappings
    .filter((mapping) => !mapped.has(mapping.key))
    .map((mapping) => mapping.label)
}

/**
 * What must exist before the first invoice, supplier bill or cash posting can
 * succeed. Stock Receipt (inventory) mappings are reported on their own panel.
 */
export function missingFinanceSetup(state: FinanceSetupState): string[] {
  const missing: string[] = []
  if (state.activeAccountCount < 2) {
    missing.push('At least two active ledger accounts')
  }
  if (state.openPeriodCount === 0) {
    missing.push('An open fiscal period')
  }
  const receivables = unmappedLabels(RECEIVABLE_MAPPINGS, state.mappedSystemKeys)
  if (receivables.length > 0) {
    missing.push(`Receivables control accounts: ${receivables.join(', ')}`)
  }
  const payables = unmappedLabels(PAYABLE_MAPPINGS, state.mappedSystemKeys)
  if (payables.length > 0) {
    missing.push(`Payables control accounts: ${payables.join(', ')}`)
  }
  if (state.activeCashAccountCount === 0) {
    missing.push('At least one active cash account')
  }
  return missing
}
