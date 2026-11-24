import { describe, expect, it } from 'vitest'
import {
  claimLinkOption,
  claimPaymentLabel,
  type ClaimLinkInvoice,
} from './claim-invoice-link'

const invoice = (overrides: Partial<ClaimLinkInvoice> = {}): ClaimLinkInvoice => ({
  id: '55555555-5555-4555-8555-555555555555',
  invoice_number: 'INV-202611-001',
  status: 'issued',
  reversed: false,
  subtotal_cents: 125_000_00,
  linked_claim_number: null,
  ...overrides,
})

describe('claimLinkOption', () => {
  it.each(['issued', 'partial_payment', 'paid', 'overdue'])('allows a matching %s invoice', (status) => {
    expect(claimLinkOption(125_000_00, invoice({ status }))).toMatchObject({ linkable: true, reason: null })
  })

  it('blocks a draft, a cancelled and a reversed invoice', () => {
    expect(claimLinkOption(125_000_00, invoice({ status: 'draft' }))).toMatchObject({
      linkable: false,
      reason: 'still a draft',
    })
    expect(claimLinkOption(125_000_00, invoice({ status: 'cancelled' }))).toMatchObject({
      linkable: false,
      reason: 'cancelled',
    })
    expect(claimLinkOption(125_000_00, invoice({ reversed: true }))).toMatchObject({
      linkable: false,
      reason: 'reversed',
    })
  })

  it('blocks an invoice another live claim holds and says which one', () => {
    expect(claimLinkOption(125_000_00, invoice({ linked_claim_number: 'PC-00007' }))).toMatchObject({
      linkable: false,
      reason: 'already on claim PC-00007',
    })
  })

  it('blocks a mismatched amount', () => {
    expect(claimLinkOption(100_000_00, invoice())).toMatchObject({
      linkable: false,
      reason: 'amount differs from the claim',
    })
  })
})

describe('claimPaymentLabel', () => {
  it('derives the payment state from the linked invoice receipts', () => {
    expect(claimPaymentLabel({ status: 'issued', reversed: false })).toBe('Awaiting payment')
    expect(claimPaymentLabel({ status: 'overdue', reversed: false })).toBe('Awaiting payment')
    expect(claimPaymentLabel({ status: 'partial_payment', reversed: false })).toBe('Partially paid')
    expect(claimPaymentLabel({ status: 'paid', reversed: false })).toBe('Paid in full')
    expect(claimPaymentLabel({ status: 'paid', reversed: true })).toBe('Invoice reversed')
  })
})
