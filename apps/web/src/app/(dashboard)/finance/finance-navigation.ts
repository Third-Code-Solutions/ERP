export interface FinanceNavItem {
  href: string
  label: string
  description: string
}

export const FINANCE_NAV_ITEMS: readonly FinanceNavItem[] = [
  {
    href: '/finance',
    label: 'Finance',
    description: 'Accounting controls and posting setup',
  },
  {
    href: '/finance/receivables',
    label: 'Receivables',
    description: 'Posted customer balances and aging',
  },
  {
    href: '/finance/payables',
    label: 'Payables',
    description: 'Matched supplier bills and aging',
  },
  {
    href: '/finance/cash',
    label: 'Cash',
    description: 'Allocated receipts and disbursements',
  },
  {
    href: '/finance/reconciliation',
    label: 'Reconciliation',
    description: 'Bank statement matching and close',
  },
]

export function getActiveFinanceNavHref(pathname: string): string {
  return (
    FINANCE_NAV_ITEMS.filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    ).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? '/finance'
  )
}
