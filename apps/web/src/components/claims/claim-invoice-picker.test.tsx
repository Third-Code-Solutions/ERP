import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ClaimInvoicePicker } from './claim-invoice-picker'
import type { ClaimLinkInvoice } from '@/lib/claim-invoice-link'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

const invoice = (overrides: Partial<ClaimLinkInvoice>): ClaimLinkInvoice => ({
  id: '55555555-5555-4555-8555-555555555555',
  invoice_number: 'INV-202611-001',
  status: 'issued',
  reversed: false,
  subtotal_cents: 125_000_00,
  linked_claim_number: null,
  ...overrides,
})

function render(invoices: ClaimLinkInvoice[]): string {
  return renderToStaticMarkup(
    <ClaimInvoicePicker
      claimAmountCents={125_000_00}
      projectId={PROJECT_ID}
      invoices={invoices}
      value=""
      onChange={() => undefined}
    />
  )
}

describe('ClaimInvoicePicker', () => {
  it('shows the claim amount beside each invoice subtotal and leaves a matching issued invoice selectable', () => {
    const markup = render([invoice({})])

    expect(markup).toContain('for="claim-invoice-picker"')
    expect(markup).toContain('claim amount ₱125,000.00')
    expect(markup).toContain('INV-202611-001 · subtotal ₱125,000.00')
    expect(markup).not.toMatch(/<option[^>]*disabled=""[^>]*>INV-202611-001/)
  })

  it('disables draft, mismatched, reversed and already-linked invoices with the reason', () => {
    const markup = render([
      invoice({ id: 'a', invoice_number: 'INV-D', status: 'draft' }),
      invoice({ id: 'b', invoice_number: 'INV-M', subtotal_cents: 100_000_00 }),
      invoice({ id: 'c', invoice_number: 'INV-R', reversed: true }),
      invoice({ id: 'd', invoice_number: 'INV-L', linked_claim_number: 'PC-00007' }),
    ])

    expect(markup).toMatch(/<option[^>]*disabled=""[^>]*>INV-D[^<]*still a draft/)
    expect(markup).toMatch(/<option[^>]*disabled=""[^>]*>INV-M[^<]*amount differs from the claim/)
    expect(markup).toMatch(/<option[^>]*disabled=""[^>]*>INV-R[^<]*reversed/)
    expect(markup).toMatch(/<option[^>]*disabled=""[^>]*>INV-L[^<]*already on claim PC-00007/)
    expect(markup).toContain('No invoice on this project can be linked')
    expect(markup).toContain(`href="/projects/${PROJECT_ID}/billing"`)
  })

  it('points to the project billing page, not a raw route, when the project has no invoice', () => {
    const markup = render([])

    expect(markup).toContain('No invoices exist for this project yet.')
    expect(markup).toContain(`href="/projects/${PROJECT_ID}/billing"`)
    expect(markup).not.toContain('/invoices.')
  })
})
