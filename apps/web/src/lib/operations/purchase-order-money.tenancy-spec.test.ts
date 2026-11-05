// Spec-derived tests for C-3 / C-5 on the legacy web PO helper
// (spec §9 PO-1..PO-7, PV-2; AC-TEN-09, AC-TEN-10, AC-TEN-13; plan §7.4).
import { describe, expect, it } from 'vitest'
import { TAX_DEFAULTS } from '@third-code-erp/shared-types'
import {
  calculateLineTotalCents,
  calculatePurchaseOrderTotals,
} from './purchase-order-money'

const DEFAULTS = { vatBps: 1200, ewtBps: 200 }

describe('calculatePurchaseOrderTotals with resolved rates (C-3)', () => {
  it.each([
    ['PO-1 messy, defaults', 899_883, DEFAULTS, 107_986, 17_998, 989_871],
    ['PO-2 tie, tiny, defaults', 25, DEFAULTS, 3, 1, 27],
    ['PO-3 round, defaults', 10_000_000, DEFAULTS, 1_200_000, 200_000, 11_000_000],
    ['PO-5 tie, real, defaults', 1_234_575, DEFAULTS, 148_149, 24_692, 1_358_032],
    ['PO-7 profile EWT 1%', 899_883, { vatBps: 1200, ewtBps: 100 }, 107_986, 8_999, 998_870],
  ] as const)('%s', (_name, subtotal, rates, vat, ewt, total) => {
    expect(calculatePurchaseOrderTotals(subtotal, rates)).toEqual({
      subtotalCents: subtotal,
      vatCents: vat,
      withholdingTaxCents: ewt,
      totalCents: total,
    })
  })

  it('PO-4 built from lines: line totals summed, then VAT and EWT once on P', () => {
    const subtotal = [
      calculateLineTotalCents(28_550, 120),
      calculateLineTotalCents(1_875, 2_500),
      calculateLineTotalCents(51_235, 37),
    ].reduce((sum, value) => sum + value, 0)
    expect(subtotal).toBe(10_009_195)
    expect(calculatePurchaseOrderTotals(subtotal, DEFAULTS)).toEqual({
      subtotalCents: 10_009_195,
      vatCents: 1_201_103,
      withholdingTaxCents: 200_184,
      totalCents: 11_010_114,
    })
  })

  it('PO-6 a non-VAT tenant profile does not touch PO VAT (AC-TEN-10, D-TEN-2)', () => {
    const nonVatTenant = {
      vatBps: 1200,
      ewtBps: 200,
      retentionBps: 1000,
      vatRegistered: false,
      source: 'profile' as const,
      profileId: '11111111-1111-4111-8111-111111111111',
      profileCode: 'NONVAT',
      asOf: '2026-11-05',
    }
    expect(calculatePurchaseOrderTotals(899_883, nonVatTenant)).toEqual({
      subtotalCents: 899_883,
      vatCents: 107_986,
      withholdingTaxCents: 17_998,
      totalCents: 989_871,
    })
  })

  it('TAX_DEFAULTS as the rates reproduces PO-1 (989,871)', () => {
    expect(calculatePurchaseOrderTotals(899_883, TAX_DEFAULTS).totalCents).toBe(989_871)
  })

  it('still refuses a negative or fractional subtotal', () => {
    expect(() => calculatePurchaseOrderTotals(-1, DEFAULTS)).toThrow(RangeError)
    expect(() => calculatePurchaseOrderTotals(1.5, DEFAULTS)).toThrow(RangeError)
  })
})

describe('PV-2 PO form preview equals the server and today\'s float form (AC-TEN-13)', () => {
  it('subtotal 1,234,575 → VAT 148,149, EWT 24,692, total 1,358,032; Math.round agrees', () => {
    const subtotal = 1_234_575
    const totals = calculatePurchaseOrderTotals(subtotal, TAX_DEFAULTS)
    expect(totals).toMatchObject({ vatCents: 148_149, withholdingTaxCents: 24_692, totalCents: 1_358_032 })
    const vat = Math.round(subtotal * 0.12)
    const ewt = Math.round(subtotal * 0.02)
    expect([vat, ewt, subtotal + vat - ewt]).toEqual([148_149, 24_692, 1_358_032])
  })

  it('equals the old float preview for every subtotal 0..300,000', () => {
    let mismatches = 0
    for (let s = 0; s <= 300_000; s += 1) {
      const totals = calculatePurchaseOrderTotals(s, TAX_DEFAULTS)
      const vat = Math.round(s * 0.12)
      const ewt = Math.round(s * 0.02)
      if (totals.vatCents !== vat || totals.withholdingTaxCents !== ewt || totals.totalCents !== s + vat - ewt) {
        mismatches += 1
      }
    }
    expect(mismatches).toBe(0)
  }, 60_000)
})
