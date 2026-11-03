import { describe, expect, it } from 'vitest'

import { invoiceCollectionTotals } from './invoice-collections'

describe('invoiceCollectionTotals', () => {
  it('counts partial receipts, caps over-receipts, trusts a paid status, and skips unbilled rows', () => {
    const totals = invoiceCollectionTotals(
      [
        { id: 'a', status: 'partial_payment', net_amount_cents: 100_00 },
        { id: 'b', status: 'issued', net_amount_cents: 50_00 },
        { id: 'c', status: 'paid', net_amount_cents: 30_00 },
        { id: 'd', status: 'overdue', net_amount_cents: 20_00 },
        { id: 'e', status: 'draft', net_amount_cents: 999_00 },
        { id: 'f', status: 'cancelled', net_amount_cents: 999_00 },
      ],
      new Map([
        ['a', 40_00],
        ['d', 25_00],
      ]),
    )

    expect(totals).toEqual({ invoiced: 200_00, paid: 90_00, outstanding: 110_00 })
  })
})
