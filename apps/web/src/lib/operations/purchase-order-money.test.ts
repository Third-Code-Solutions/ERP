import { TAX_DEFAULTS } from '@third-code-erp/shared-types'
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
    expect(calculatePurchaseOrderTotals(100_000, TAX_DEFAULTS)).toEqual({
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

// Deterministic PRNG (mulberry32) so a failure is reproducible.
function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PROPERTY_TIMEOUT_MS = 120_000

// Spec tenancy AC-TEN-13 / C-5: the PO form now previews with this helper. At
// the defaults it equals the old float preview for every subtotal.
describe('PO form preview equals the old float math (AC-TEN-13)', () => {
  function assertEqualsFloat(s: number) {
    const totals = calculatePurchaseOrderTotals(s, TAX_DEFAULTS)
    const vat = Math.round(s * 0.12)
    const ewt = Math.round(s * 0.02)
    if (
      totals.vatCents !== vat ||
      totals.withholdingTaxCents !== ewt ||
      totals.totalCents !== s + vat - ewt
    ) {
      throw new Error(`mismatch at subtotal ${s}`)
    }
  }

  it('PV-2: subtotal 1,234,575 gives VAT 148,149, EWT 24,692 and total 1,358,032', () => {
    expect(calculatePurchaseOrderTotals(1_234_575, TAX_DEFAULTS)).toEqual({
      subtotalCents: 1_234_575,
      vatCents: 148_149,
      withholdingTaxCents: 24_692,
      totalCents: 1_358_032,
    })
    assertEqualsFloat(1_234_575)
  })

  it('every subtotal 0..3,000,000', () => {
    for (let s = 0; s <= 3_000_000; s += 1) assertEqualsFloat(s)
  }, PROPERTY_TIMEOUT_MS)

  it('2,000,000 seeded random subtotals below 10^13', () => {
    const random = seededRandom(20261105)
    for (let i = 0; i < 2_000_000; i += 1) {
      assertEqualsFloat(Math.floor(random() * 1e6) * 1e7 + Math.floor(random() * 1e7))
    }
  }, PROPERTY_TIMEOUT_MS)
})
