import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STOCK_RECEIPT_RECEIVABLE_PO_STATUSES } from '@third-code-erp/shared-types'
import { ReceiveLineForm } from './receive-line-form'

const PO_ID = '44444444-4444-4444-8444-444444444444'
const RECEIPT_LINK = '/inventory/receipts/new'

function render(
  overrides: Partial<React.ComponentProps<typeof ReceiveLineForm>> = {}
): string {
  return renderToStaticMarkup(
    <ReceiveLineForm
      purchaseOrderId={PO_ID}
      purchaseOrderStatus="issued"
      canReceive
      orderedMicros={10_000_000}
      receivedMicros={0}
      {...overrides}
    />
  )
}

describe('ReceiveLineForm', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React)
  })

  it.each(STOCK_RECEIPT_RECEIVABLE_PO_STATUSES)(
    'links a %s PO line to a receipt for that PO',
    (purchaseOrderStatus) => {
      expect(render({ purchaseOrderStatus })).toContain(
        `href="${RECEIPT_LINK}?po=${PO_ID}"`
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
    expect(html).not.toContain(RECEIPT_LINK)
    expect(html).toContain('0 / 10')
  })

  it('offers no Receive to a role without inventory.manage', () => {
    expect(render({ canReceive: false })).not.toContain(RECEIPT_LINK)
  })

  it('judges a fractional line on exact micros, not the rounded integer mirrors', () => {
    // Fully received 2.5: the integer mirrors read 2 / 3.
    const full = render({ orderedMicros: 2_500_000, receivedMicros: 2_500_000 })
    expect(full).not.toContain(RECEIPT_LINK)
    expect(full).toContain('2.5 / 2.5')
    // Nothing received of 0.4: the integer mirrors read 0 / 0.
    const open = render({ orderedMicros: 400_000, receivedMicros: 0 })
    expect(open).toContain(RECEIPT_LINK)
    expect(open).toContain('0 / 0.4')
  })
})
