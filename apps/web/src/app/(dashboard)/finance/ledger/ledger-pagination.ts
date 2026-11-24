export const LEDGER_PAGE_SIZE = 100

/** 1-based page from a query-string value; anything unusable is page 1. */
export function parseLedgerPage(value: string | undefined): number {
  if (!value || !/^\d{1,6}$/.test(value)) return 1
  return Math.max(Number(value), 1)
}

export function ledgerPageCount(totalLines: number): number {
  return Math.max(Math.ceil(totalLines / LEDGER_PAGE_SIZE), 1)
}

/** Keeps a stale or hand-edited page number inside the real range. */
export function clampLedgerPage(page: number, totalLines: number): number {
  return Math.min(Math.max(page, 1), ledgerPageCount(totalLines))
}

export function ledgerPageWindow(
  page: number,
  totalLines: number
): { first: number; last: number } {
  if (totalLines === 0) return { first: 0, last: 0 }
  return {
    first: (page - 1) * LEDGER_PAGE_SIZE + 1,
    last: Math.min(page * LEDGER_PAGE_SIZE, totalLines),
  }
}

const FILTER_KEYS = ['account', 'customer', 'vendor', 'from', 'to'] as const

/** Link to another page that keeps the filters currently applied. */
export function ledgerPageHref(
  filters: Partial<Record<(typeof FILTER_KEYS)[number], string | undefined>>,
  page: number
): string {
  const query = new URLSearchParams()
  for (const key of FILTER_KEYS) {
    const value = filters[key]
    if (value) query.set(key, value)
  }
  if (page > 1) query.set('page', String(page))
  const text = query.toString()
  return text ? `/finance/ledger?${text}` : '/finance/ledger'
}
