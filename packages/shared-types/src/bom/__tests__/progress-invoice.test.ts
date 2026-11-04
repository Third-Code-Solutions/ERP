import { describe, expect, it } from 'vitest'
import {
  computeEWT,
  computeProgressInvoice,
  computeRetention,
  computeVAT,
  cumulativeBillingCapError,
  parsePercentToBps,
} from '../calculations'
import { TAX_DEFAULTS } from '../../tax-rates'

const PROPERTY_TIMEOUT_MS = 120_000

function invoice(subtotal: number, retention: number, vat: number, ewt: number, net: number) {
  return { subtotal, retention, base: subtotal - retention, vat, ewt, net }
}

describe('computeProgressInvoice (C-2), default path — must equal today', () => {
  it.each([
    ['I-1 normal', 100_000_000, 2500, invoice(25_000_000, 2_500_000, 2_700_000, 450_000, 24_750_000)],
    ['I-2 messy', 1_234_567, 3333, invoice(411_481, 41_148, 44_440, 7_407, 407_366)],
    ['I-3 tie on retention, tiny', 50, 1000, invoice(5, 1, 0, 0, 4)],
    ['I-4 tie on EWT, tiny', 280, 1000, invoice(28, 3, 3, 1, 27)],
    ['I-5 tie on retention, real', 12_345_650, 1000, invoice(1_234_565, 123_457, 133_333, 22_222, 1_222_219)],
    ['I-6 tie on EWT, real', 10_000_280, 1000, invoice(1_000_028, 100_003, 108_003, 18_001, 990_027)],
    ['I-7 zero billing', 100_000_000, 0, invoice(0, 0, 0, 0, 0)],
    ['I-8 100% in one billing', 100_000_000, 10000, invoice(100_000_000, 10_000_000, 10_800_000, 1_800_000, 99_000_000)],
  ])('%s', (_name, tcv, billBps, expected) => {
    expect(computeProgressInvoice(tcv, billBps, TAX_DEFAULTS)).toEqual({ ...expected, vatBps: 1200 })
  })

  it('PB-1..PB-4: retention across progress billings and the cap', () => {
    const tcv = 987_654_321
    const pb1 = computeProgressInvoice(tcv, 2000, TAX_DEFAULTS)
    const pb2 = computeProgressInvoice(tcv, 1750, TAX_DEFAULTS)
    const pb3 = computeProgressInvoice(tcv, 3000, TAX_DEFAULTS)
    expect(pb1).toMatchObject(invoice(197_530_864, 19_753_086, 21_333_333, 3_555_556, 195_555_555))
    expect(pb2).toMatchObject(invoice(172_839_506, 17_283_951, 18_666_667, 3_111_111, 171_111_111))
    expect(pb3).toMatchObject(invoice(296_296_296, 29_629_630, 32_000_000, 5_333_333, 293_333_333))
    expect(pb1.retention).toBe(19_753_086)
    expect(pb1.retention + pb2.retention).toBe(37_037_037)
    expect(pb1.retention + pb2.retention + pb3.retention).toBe(66_666_667)
    expect(cumulativeBillingCapError(6750, 3300)).not.toBeNull()
  })

  it('PV-1: the invoice form preview equals I-2', () => {
    expect(computeProgressInvoice(1_234_567, 3333, TAX_DEFAULTS).net).toBe(407_366)
  })
})

describe('computeProgressInvoice (C-2), profile path', () => {
  const rates = (vatBps: number, ewtBps: number, retentionBps: number, vatRegistered: boolean) => ({
    vatBps,
    ewtBps,
    retentionBps,
    vatRegistered,
  })

  it('P-1: lower EWT and retention', () => {
    expect(computeProgressInvoice(100_000_000, 2500, rates(1200, 100, 500, true))).toEqual({
      ...invoice(25_000_000, 1_250_000, 2_850_000, 237_500, 26_362_500),
      vatBps: 1200,
    })
  })

  it('P-2: a non-VAT tenant charges no output VAT; EWT and retention still apply', () => {
    expect(computeProgressInvoice(100_000_000, 2500, rates(1200, 200, 1000, false))).toEqual({
      ...invoice(25_000_000, 2_500_000, 0, 450_000, 22_050_000),
      vatBps: 0,
    })
  })

  it('P-3: zero retention', () => {
    expect(computeProgressInvoice(100_000_000, 2500, rates(1200, 200, 0, true))).toEqual({
      ...invoice(25_000_000, 0, 3_000_000, 500_000, 27_500_000),
      vatBps: 1200,
    })
  })

  it('P-4: profile on PB-1 inputs', () => {
    expect(computeProgressInvoice(987_654_321, 2000, rates(1200, 200, 500, true))).toEqual({
      ...invoice(197_530_864, 9_876_543, 22_518_519, 3_753_086, 206_419_754),
      vatBps: 1200,
    })
  })
})

// Ported from the deleted components/billing/invoice-preview.test.ts (D-15):
// the preview must equal the server draft (integer, half-up), never float math.
describe('invoice form preview (D-15)', () => {
  it('normal: 25% of PHP 1,000,000.00', () => {
    expect(computeProgressInvoice(100_000_000, 2_500, TAX_DEFAULTS)).toMatchObject({
      subtotal: 25_000_000,
      retention: 2_500_000,
      vat: 2_700_000,
      ewt: 450_000,
      net: 24_750_000,
    })
  })

  it('boundaries: 0% bills nothing, 100% bills the full TCV', () => {
    expect(computeProgressInvoice(100_000_000, 0, TAX_DEFAULTS)).toMatchObject({
      subtotal: 0,
      retention: 0,
      vat: 0,
      ewt: 0,
      net: 0,
    })
    expect(computeProgressInvoice(100_000_000, 10_000, TAX_DEFAULTS)).toMatchObject({
      subtotal: 100_000_000,
      retention: 10_000_000,
      vat: 10_800_000,
      ewt: 1_800_000,
      net: 99_000_000,
    })
  })

  it('.5 tie rounds up where the float preview showed one centavo less', () => {
    expect(Math.round((25_000 * 0.29 * 100) / 10_000)).toBe(72)
    expect(computeProgressInvoice(25_000, 29, TAX_DEFAULTS)).toMatchObject({
      subtotal: 73,
      retention: 7,
      vat: 8,
      ewt: 1,
      net: 73,
    })
  })

  it('messy: 33.33% of PHP 1,234,567.89', () => {
    expect(computeProgressInvoice(123_456_789, 3_333, TAX_DEFAULTS)).toMatchObject({
      subtotal: 41_148_148,
      retention: 4_114_815,
      vat: 4_444_000,
      ewt: 740_667,
      net: 40_736_666,
    })
  })

  it('previews the bps the server will receive for a typed 8.325%', () => {
    const bps = parsePercentToBps('8.325')
    expect(bps).toBe(833)
    expect(computeProgressInvoice(100_000_000, bps ?? 0, TAX_DEFAULTS).subtotal).toBe(8_330_000)
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

// AC-TEN-13 / C-5: at the defaults the shared half-up functions equal the old
// float previews for every subtotal, so no preview amount moves.
describe('defaults equal the old float math (AC-TEN-13)', () => {
  function assertEqualsFloat(s: number) {
    if (
      computeVAT(s) !== Math.round(s * 0.12) ||
      computeEWT(s) !== Math.round(s * 0.02) ||
      computeRetention(s) !== Math.round(s * 0.1)
    ) {
      throw new Error(`mismatch at subtotal ${s}`)
    }
  }

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
