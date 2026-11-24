import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/claims/[id]/actions', () => ({
  submitClaim: vi.fn(),
  markCertificatePending: vi.fn(),
  recordCertification: vi.fn(),
  handoverToFinance: vi.fn(),
  linkInvoice: vi.fn(),
  recordPayment: vi.fn(),
  rejectClaim: vi.fn(),
  cancelClaim: vi.fn(),
}))

import { ClaimTransitionActions } from './claim-transition-actions'

function renderInvoiced(linkedInvoiceReversed: boolean): string {
  return renderToStaticMarkup(
    <ClaimTransitionActions
      claimId="44444444-4444-4444-8444-444444444444"
      projectId="33333333-3333-4333-8333-333333333333"
      claimAmountCents={125_000_00}
      status="invoiced"
      linkedInvoiceReversed={linkedInvoiceReversed}
      certificateDocs={[]}
      invoices={[]}
    />
  )
}

describe('ClaimTransitionActions on an invoiced claim', () => {
  it('offers payment, not rejection, while the invoice is live', () => {
    const markup = renderInvoiced(false)

    expect(markup).toContain('Record payment')
    expect(markup).not.toContain('Reject claim')
    expect(markup).toContain('void its invoice first with Reverse invoice in Finance')
  })

  it('offers rejection, not payment, once the invoice is reversed', () => {
    const markup = renderInvoiced(true)

    expect(markup).toContain('Reject claim')
    expect(markup).not.toContain('Record payment')
    expect(markup).toContain('Its invoice was reversed')
  })
})
