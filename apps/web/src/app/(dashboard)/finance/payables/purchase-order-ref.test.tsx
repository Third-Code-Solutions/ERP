import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { canViewPath } from '@/lib/operations/nav-config'
import { PurchaseOrderRef } from './purchase-order-ref'

describe('PurchaseOrderRef', () => {
  it('links the Purchase Order for a role that can open it', () => {
    expect(
      renderToStaticMarkup(
        <PurchaseOrderRef id="po-1" number="PO-0001" canOpen />
      )
    ).toBe('<a href="/purchase-orders/po-1">PO-0001</a>')
  })

  it('renders plain text for a role that would be bounced from the page', () => {
    expect(
      renderToStaticMarkup(
        <PurchaseOrderRef id="po-1" number="PO-0001" canOpen={false} />
      )
    ).toBe('PO-0001')
  })

  it('matches the route policy: Finance cannot open Purchase Orders, Procurement can', () => {
    expect(canViewPath('finance', '/purchase-orders/x')).toBe(false)
    expect(canViewPath('procurement', '/purchase-orders/x')).toBe(true)
  })
})
