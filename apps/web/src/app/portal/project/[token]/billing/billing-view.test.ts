import { describe, expect, it } from 'vitest'
import {
  PORTAL_CLAIM_STATUSES,
  PORTAL_INVOICE_STATUSES,
  portalBillingTotals,
} from './billing-view'

describe('portal status filters', () => {
  it('lists only issued invoice statuses, never draft or cancelled', () => {
    expect(PORTAL_INVOICE_STATUSES).toEqual(['issued', 'partial_payment', 'paid', 'overdue'])
    expect(PORTAL_INVOICE_STATUSES).not.toContain('draft')
    expect(PORTAL_INVOICE_STATUSES).not.toContain('cancelled')
  })

  it('lists only submitted-or-later claims, never draft, rejected or cancelled', () => {
    expect(PORTAL_CLAIM_STATUSES).toEqual([
      'submitted',
      'certificate_pending',
      'certified',
      'handed_over_finance',
      'invoiced',
      'paid',
    ])
    for (const internal of ['draft', 'rejected', 'cancelled']) {
      expect(PORTAL_CLAIM_STATUSES).not.toContain(internal)
    }
  })
})

describe('portalBillingTotals', () => {
  it('nets posted partial receipts off the outstanding balance', () => {
    const totals = portalBillingTotals(
      [
        { id: 'a', status: 'partial_payment', net_amount_cents: 100_000 },
        { id: 'b', status: 'issued', net_amount_cents: 50_000 },
      ],
      new Map([['a', 40_000]])
    )

    expect(totals).toEqual({ invoicedCents: 150_000, paidCents: 40_000, outstandingCents: 110_000 })
  })

  it('treats a paid invoice as settled even with no receipt allocated to it', () => {
    const totals = portalBillingTotals(
      [
        { id: 'a', status: 'paid', net_amount_cents: 100_000 },
        { id: 'b', status: 'overdue', net_amount_cents: 25_000 },
      ],
      new Map()
    )

    expect(totals).toEqual({ invoicedCents: 125_000, paidCents: 100_000, outstandingCents: 25_000 })
  })

  it('never lets a receipt exceed the invoice or turn the balance negative', () => {
    const totals = portalBillingTotals(
      [{ id: 'a', status: 'partial_payment', net_amount_cents: 10_000 }],
      new Map([['a', 12_000]])
    )

    expect(totals).toEqual({ invoicedCents: 10_000, paidCents: 10_000, outstandingCents: 0 })
  })

  it('is all zero with no invoices', () => {
    expect(portalBillingTotals([], new Map())).toEqual({
      invoicedCents: 0,
      paidCents: 0,
      outstandingCents: 0,
    })
  })
})
