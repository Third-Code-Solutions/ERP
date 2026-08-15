import Link from 'next/link'
import * as React from 'react'
import {
  FINANCE_NAV_ITEMS,
  getActiveFinanceNavHref,
} from './finance-navigation'

export function FinanceNavigation({ pathname }: { pathname: string }) {
  const activeHref = getActiveFinanceNavHref(pathname)

  return (
    <nav className="finance-route-nav" aria-label="Finance navigation">
      {FINANCE_NAV_ITEMS.map((item) => {
        const isActive = item.href === activeHref
        return (
          <Link
            key={item.href}
            href={item.href}
            className="finance-route-nav-link"
            aria-current={isActive ? 'page' : undefined}
            title={item.description}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
