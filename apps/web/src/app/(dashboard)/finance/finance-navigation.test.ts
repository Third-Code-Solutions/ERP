import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  FINANCE_NAV_ITEMS,
  getActiveFinanceNavHref,
} from './finance-navigation'
import { FinanceNavigation } from './finance-navigation-view'

describe('Finance navigation', () => {
  it('keeps the five Finance destinations in the requested order', () => {
    expect(FINANCE_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Finance',
      'Receivables',
      'Payables',
      'Cash',
      'Reconciliation',
    ])
  })

  it('selects the most specific destination for nested routes', () => {
    expect(getActiveFinanceNavHref('/finance')).toBe('/finance')
    expect(getActiveFinanceNavHref('/finance/receivables')).toBe(
      '/finance/receivables'
    )
    expect(getActiveFinanceNavHref('/finance/payables/123/edit')).toBe(
      '/finance/payables'
    )
    expect(getActiveFinanceNavHref('/finance/cash/new')).toBe('/finance/cash')
    expect(getActiveFinanceNavHref('/finance/reconciliation/123')).toBe(
      '/finance/reconciliation'
    )
  })

  it('falls back to the Finance control center for ledger and journal routes', () => {
    expect(getActiveFinanceNavHref('/finance/ledger')).toBe('/finance')
    expect(getActiveFinanceNavHref('/finance/journals/new')).toBe('/finance')
  })

  it('renders one accessible active state for the local navigation rail', () => {
    const markup = renderToStaticMarkup(
      createElement(FinanceNavigation, { pathname: '/finance/cash/new' })
    )

    expect(markup).toContain('aria-label="Finance navigation"')
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
    expect(markup).toContain('href="/finance/cash"')
    expect(markup).toContain('title="Allocated receipts and disbursements"')
  })
})
