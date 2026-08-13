import { describe, expect, it } from 'vitest'
import {
  calculateLineTotalCents,
  calculatePurchaseOrderTotals,
} from './purchase-order-money'

describe('purchase-order centavo arithmetic', () => {
  it('calculates line totals without floating point arithmetic', () => {
    expect(calculateLineTotalCents(125_000, 3)).toBe(375_000)
  })

  it('applies half-up basis-point tax calculations', () => {
    expect(calculatePurchaseOrderTotals(100_000)).toEqual({
      subtotalCents: 100_000,
      vatCents: 12_000,
      withholdingTaxCents: 2_000,
      totalCents: 110_000,
    })
  })

  it('rejects unsafe centavo products instead of rounding them', () => {
    expect(() => calculateLineTotalCents(Number.MAX_SAFE_INTEGER, 2)).toThrow(
      'Line total exceeds the supported centavo range'
    )
  })
})
