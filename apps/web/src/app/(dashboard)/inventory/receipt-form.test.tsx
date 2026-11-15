import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('./actions', () => ({ createStockReceipt: vi.fn() }))

import { StockReceiptForm } from './receipt-form'

function render(defaultPurchaseOrderId?: string): string {
  return renderToStaticMarkup(
    <StockReceiptForm
      purchaseOrders={['po-1', 'po-2'].map((id) => ({
        id,
        number: id.toUpperCase(),
        projectId: 'p-1',
        projectLabel: 'P',
        vendorLabel: 'V',
      }))}
      lines={[]}
      warehouses={[]}
      deliveries={[]}
      today="2026-11-16"
      defaultPurchaseOrderId={defaultPurchaseOrderId}
    />
  )
}

function selectedPo(html: string): string | undefined {
  return html.match(/<option value="(po-\d)" selected="">/)?.[1]
}

describe('StockReceiptForm', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
  })

  it('preselects the PO the PO page linked from', () => {
    expect(selectedPo(render('po-2'))).toBe('po-2')
  })

  it('falls back to the first PO for an id it does not offer', () => {
    expect(selectedPo(render('po-unknown'))).toBe('po-1')
    expect(selectedPo(render())).toBe('po-1')
  })
})
