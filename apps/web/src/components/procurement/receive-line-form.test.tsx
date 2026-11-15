import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReceiveLineForm } from './receive-line-form'

const PO_ID = '44444444-4444-4444-8444-444444444444'

function render(
  overrides: Partial<React.ComponentProps<typeof ReceiveLineForm>> = {}
): string {
  return renderToStaticMarkup(
    <ReceiveLineForm
      purchaseOrderId={PO_ID}
      purchaseOrderStatus="issued"
      canReceive
      quantity={10}
      receivedQty={0}
      {...overrides}
    />
  )
}

describe('ReceiveLineForm', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
  })

  it.each(['issued', 'partial_delivered'])(
    'links a %s PO line to a receipt for that PO',
    (purchaseOrderStatus) => {
      expect(render({ purchaseOrderStatus })).toContain(
        `href="/inventory/receipts/new?po=${PO_ID}"`
      )
    }
  )

  it.each([
    'draft',
    'submitted',
    'pending_pm_approval',
    'pending_commercial_approval',
    'pending_scm_issuance',
    'cancelled',
  ])('offers no Receive on a %s PO, which receipt posting refuses', (purchaseOrderStatus) => {
    const html = render({ purchaseOrderStatus })
    expect(html).not.toContain('Receive<')
    expect(html).toContain('0 / 10')
  })

  it('offers no Receive to a role without inventory.manage', () => {
    expect(render({ canReceive: false })).not.toContain('Receive<')
  })

  it('offers no Receive on a fully received line', () => {
    expect(render({ receivedQty: 10 })).not.toContain('Receive<')
  })
})
