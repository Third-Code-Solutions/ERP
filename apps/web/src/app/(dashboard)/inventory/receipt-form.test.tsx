import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('./actions', () => ({ createStockReceipt: vi.fn() }))

import { StockReceiptForm } from './receipt-form'

const PO_IDS = ['po-1', 'po-2']

function render(
  defaultPurchaseOrderId?: string,
  patch: { ready?: boolean; notReadyReason?: string | null } = {}
): string {
  return renderToStaticMarkup(
    <StockReceiptForm
      purchaseOrders={PO_IDS.map((id) => ({
        id,
        number: id.toUpperCase(),
        projectId: 'p-1',
        projectLabel: 'P',
        vendorLabel: 'V',
      }))}
      lines={PO_IDS.map((id) => ({
        id: `line-${id}`,
        purchaseOrderId: id,
        code: `CODE-${id.toUpperCase()}`,
        description: 'Item',
        uom: 'pc',
        orderedMicros: 1_000_000,
        receivedMicros: 0,
        unitCostCents: 100,
        ready: true,
        ...patch,
      }))}
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

  it('preselects the PO the PO page linked from and shows only its lines', () => {
    const html = render('po-2')
    expect(selectedPo(html)).toBe('po-2')
    expect(html).toContain('CODE-PO-2')
    expect(html).not.toContain('CODE-PO-1')
  })

  it('says why a line cannot be received instead of a generic setup hint', () => {
    const html = render('po-1', {
      ready: false,
      notReadyReason: 'Not linked to a stock item. Open the Purchase Order and link it.',
    })

    expect(html).toContain('Not linked to a stock item. Open the Purchase Order and link it.')
    expect(html).not.toContain('configure tracked Item and UOM')
  })

  it('falls back to the first PO for an id it does not offer', () => {
    expect(selectedPo(render('po-unknown'))).toBe('po-1')
    expect(selectedPo(render())).toBe('po-1')
  })
})
