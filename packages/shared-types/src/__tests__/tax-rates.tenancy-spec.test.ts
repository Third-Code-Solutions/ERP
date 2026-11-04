// Spec-derived tests for the `tenancy` module (docs/erp/specs/tenancy.md).
// Expected values come from spec §8 (C-0..C-5) and §9 (worked examples), not
// from the implementation. Contract names come from docs/erp/plans/tenancy.md §7.
//
// AC → test map for all *.tenancy-spec.* files (ST = this file;
// DB = packages/database/src/tax/effective-tax-rates.tenancy-spec.test.ts;
// API = apps/api/src/common/tax-rates.tenancy-spec.spec.ts;
// INT = apps/api/integration/tax-rates.tenancy-spec.http.integration.spec.ts (DB-gated);
// PO = apps/web/src/lib/operations/purchase-order-money.tenancy-spec.test.ts;
// VIEW = apps/web/src/app/(dashboard)/settings/tax/page.tenancy-spec.test.tsx;
// E2E = apps/web/e2e/tax-settings.tenancy-spec.spec.ts)
//   AC-TEN-01  VIEW "AC-TEN-01 defaults (R-1)"; E2E
//   AC-TEN-02  VIEW "AC-TEN-02 profile in force"
//   AC-TEN-03  VIEW "AC-TEN-03 access control" (9 denied roles, 401, flag off)
//   AC-TEN-04  VIEW "AC-TEN-04 no edit controls"; E2E
//   AC-TEN-05  INT "gated tax-profile write API" (401 / 403 / 503, no row change)
//   AC-TEN-06  ST I-1..I-8, invoiceTaxAudit default; API default; INT invoice tenant T
//   AC-TEN-07  ST P-1..P-4; INT invoice tenant U (retention_bps 500, audit profile)
//   AC-TEN-08  ST P-2, invoiceTaxAudit vatBps 0; INT invoice tenant N
//   AC-TEN-09  ST PO-1..PO-7; PO PO-1..PO-7 (Core API PO paths: not covered here)
//   AC-TEN-10  PO PO-6; ST purchaseOrderTaxAudit
//   AC-TEN-11  ST formatBps C-4 + TAX_DEFAULTS label text (label sites: not covered here)
//   AC-TEN-12  not covered here
//   AC-TEN-13  ST property tests + PV-1..PV-3; PO PV-2 + 0..300,000 sweep
//   AC-TEN-14  INT G-5 (names A-OPEN); G-6 adjacent passes
//   AC-TEN-15  INT G-3 refused, G-4 starts today passes
//   AC-TEN-16  INT G-1 403 with no audit/workflow row; G-2 approved_by = X
//   AC-TEN-17  ST R-3, R-5, R-6; INT resolver suite
//   AC-TEN-18  DB tenant predicate first; INT resolver (R-9) + invoices + 404 cross-tenant; VIEW tenant predicate
//   AC-TEN-19  ST R-7; DB R-7; API 409 + logged; INT invoice tenant O (no row); VIEW conflict alert
//   R-8 / Manila boundary  ST, DB, INT;  G-7 replay  INT
import { describe, expect, it } from 'vitest'
import {
  TAX_DEFAULTS,
  TaxProfileOverlapError,
  formatBps,
  invoiceTaxAudit,
  manilaCalendarDate,
  pickEffectiveTaxRates,
  purchaseOrderTaxAudit,
  type EffectiveTaxRates,
  type TaxProfileCandidate,
} from '../index'
import {
  computeEWT,
  computeProgressInvoice,
  computeRetention,
  computeVAT,
  cumulativeBillingCapError,
} from '../bom/calculations'

const DEFAULT_RATES = {
  vatBps: 1200,
  ewtBps: 200,
  retentionBps: 1000,
  vatRegistered: true,
} as const

function profile(overrides: Partial<TaxProfileCandidate> & Pick<TaxProfileCandidate, 'code'>): TaxProfileCandidate {
  return {
    id: `00000000-0000-4000-8000-${overrides.code.padStart(12, '0').slice(-12)}`,
    status: 'active',
    valid_from: '2026-01-01',
    valid_to: null,
    vat_rate_bps: 1200,
    withholding_rate_bps: 100,
    retention_rate_bps: 500,
    vat_registered: true,
    ...overrides,
  }
}

function rates(overrides: Partial<EffectiveTaxRates> = {}): EffectiveTaxRates {
  return {
    ...DEFAULT_RATES,
    source: 'default',
    profileId: null,
    profileCode: null,
    asOf: '2026-11-04',
    ...overrides,
  }
}

describe('TAX_DEFAULTS (spec §5, top rule)', () => {
  it('is the single frozen constant VAT 1200 / EWT 200 / retention 1000 / VAT-registered', () => {
    expect({ ...TAX_DEFAULTS }).toEqual(DEFAULT_RATES)
    expect(Object.isFrozen(TAX_DEFAULTS)).toBe(true)
  })

  it('feeds the default bps of computeVAT, computeEWT and computeRetention', () => {
    expect(computeVAT(899_883)).toBe(computeVAT(899_883, 1200))
    expect(computeEWT(899_883)).toBe(computeEWT(899_883, 200))
    expect(computeRetention(12_345_650)).toBe(computeRetention(12_345_650, 1000))
  })
})

describe('C-1 effective-rate resolution: pickEffectiveTaxRates (R-1..R-7)', () => {
  it('R-1 no profile → TAX_DEFAULTS, source default', () => {
    expect(pickEffectiveTaxRates([], '2026-11-04')).toEqual(rates())
  })

  it('R-2 profile in force → that profile (rates, VAT flag, id, code)', () => {
    const a = profile({ code: 'A', valid_from: '2026-01-01', valid_to: '2026-12-31' })
    expect(pickEffectiveTaxRates([a], '2026-11-04')).toEqual({
      vatBps: 1200,
      ewtBps: 100,
      retentionBps: 500,
      vatRegistered: true,
      source: 'profile',
      profileId: a.id,
      profileCode: 'A',
      asOf: '2026-11-04',
    })
  })

  it('R-3 expired profile is ignored → defaults (AC-TEN-17)', () => {
    const a = profile({ code: 'A', valid_from: '2026-01-01', valid_to: '2026-10-31' })
    expect(pickEffectiveTaxRates([a], '2026-11-04')).toEqual(rates())
  })

  it('R-4 last day of valid-to is inclusive', () => {
    const a = profile({ code: 'A', valid_from: '2026-01-01', valid_to: '2026-11-04' })
    expect(pickEffectiveTaxRates([a], '2026-11-04')).toMatchObject({ source: 'profile', profileCode: 'A' })
  })

  it('R-5 future-dated profile: defaults the day before, the profile on its first day', () => {
    const b = profile({ code: 'B', valid_from: '2027-01-01', valid_to: null })
    expect(pickEffectiveTaxRates([b], '2026-12-31')).toEqual(rates({ asOf: '2026-12-31' }))
    expect(pickEffectiveTaxRates([b], '2027-01-01')).toMatchObject({
      source: 'profile',
      profileCode: 'B',
      profileId: b.id,
      asOf: '2027-01-01',
    })
  })

  it('R-6 draft or retired profiles covering D are ignored → defaults', () => {
    const a = profile({ code: 'A', status: 'draft', valid_from: '2026-01-01', valid_to: null })
    const c = profile({ code: 'C', status: 'retired', valid_from: '2026-01-01', valid_to: null })
    expect(pickEffectiveTaxRates([a, c], '2026-11-04')).toEqual(rates())
  })

  it('R-6 an ignored draft does not count toward an overlap with the one active profile', () => {
    const a = profile({ code: 'A', status: 'draft' })
    const c = profile({ code: 'C', status: 'active', vat_rate_bps: 1250 })
    expect(pickEffectiveTaxRates([a, c], '2026-11-04')).toMatchObject({ profileCode: 'C', vatBps: 1250 })
  })

  it('R-7 two active profiles covering D → TAX_PROFILE_OVERLAP naming both codes, sorted (AC-TEN-19)', () => {
    const c = profile({ code: 'C', valid_from: '2026-06-01', valid_to: null })
    const a = profile({ code: 'A', valid_from: '2026-01-01', valid_to: '2026-12-31' })
    let caught: unknown
    try {
      pickEffectiveTaxRates([c, a], '2026-11-04')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(TaxProfileOverlapError)
    expect(caught).toBeInstanceOf(Error)
    const overlap = caught as TaxProfileOverlapError & { code?: string }
    expect(overlap.profileCodes).toEqual(['A', 'C'])
    expect(overlap.asOf).toBe('2026-11-04')
    expect(`${overlap.code ?? ''} ${overlap.message}`).toContain('TAX_PROFILE_OVERLAP')
    expect(overlap.message).toContain('A')
    expect(overlap.message).toContain('C')
  })

  it('R-7 boundary: two active profiles that only touch on adjacent days do not overlap', () => {
    const a = profile({ code: 'A', valid_from: '2026-01-01', valid_to: '2026-12-31' })
    const b = profile({ code: 'B', valid_from: '2027-01-01', valid_to: null, vat_rate_bps: 1250 })
    expect(pickEffectiveTaxRates([a, b], '2026-12-31')).toMatchObject({ profileCode: 'A' })
    expect(pickEffectiveTaxRates([a, b], '2027-01-01')).toMatchObject({ profileCode: 'B', vatBps: 1250 })
  })

  it('a profile with retention 0 yields 0, never the table default or the app default (P-3)', () => {
    const z = profile({ code: 'Z', retention_rate_bps: 0, withholding_rate_bps: 200 })
    expect(pickEffectiveTaxRates([z], '2026-11-04')).toMatchObject({ retentionBps: 0, ewtBps: 200 })
  })

  it('a non-VAT profile resolves vatRegistered false but keeps its VAT bps for POs', () => {
    const n = profile({ code: 'N', vat_registered: false, withholding_rate_bps: 200, retention_rate_bps: 1000 })
    expect(pickEffectiveTaxRates([n], '2026-11-04')).toMatchObject({ vatBps: 1200, vatRegistered: false })
  })
})

describe('Manila-date boundary (C-1 D, R-8)', () => {
  it('2026-11-04T16:30Z is already 2026-11-05 in Manila', () => {
    expect(manilaCalendarDate(new Date('2026-11-04T16:30:00Z'))).toBe('2026-11-05')
    expect(manilaCalendarDate(new Date('2026-11-04T15:59:59Z'))).toBe('2026-11-04')
  })

  it('R-8 a write at 2026-12-31T16:30Z resolves against 2027-01-01', () => {
    const at = new Date('2026-12-31T16:30:00Z')
    const b = profile({ code: 'B', valid_from: '2027-01-01', valid_to: null })
    expect(pickEffectiveTaxRates([b], manilaCalendarDate(at))).toMatchObject({
      source: 'profile',
      profileCode: 'B',
      asOf: '2027-01-01',
    })
  })
})

type InvoiceExpectation = {
  subtotal: number
  retention: number
  base: number
  vat: number
  ewt: number
  net: number
}

function invoice(tcv: number, billBps: number, r = DEFAULT_RATES as Parameters<typeof computeProgressInvoice>[2]) {
  return computeProgressInvoice(tcv, billBps, r)
}

describe('C-2 progress invoice, default path (I-1..I-8) — identical to today', () => {
  const cases: Array<[string, number, number, InvoiceExpectation]> = [
    ['I-1 normal', 100_000_000, 2500, { subtotal: 25_000_000, retention: 2_500_000, base: 22_500_000, vat: 2_700_000, ewt: 450_000, net: 24_750_000 }],
    ['I-2 messy', 1_234_567, 3333, { subtotal: 411_481, retention: 41_148, base: 370_333, vat: 44_440, ewt: 7_407, net: 407_366 }],
    ['I-3 tie on retention, tiny', 50, 1000, { subtotal: 5, retention: 1, base: 4, vat: 0, ewt: 0, net: 4 }],
    ['I-4 tie on EWT, tiny', 280, 1000, { subtotal: 28, retention: 3, base: 25, vat: 3, ewt: 1, net: 27 }],
    ['I-5 tie on retention, real', 12_345_650, 1000, { subtotal: 1_234_565, retention: 123_457, base: 1_111_108, vat: 133_333, ewt: 22_222, net: 1_222_219 }],
    ['I-6 tie on EWT, real', 10_000_280, 1000, { subtotal: 1_000_028, retention: 100_003, base: 900_025, vat: 108_003, ewt: 18_001, net: 990_027 }],
    ['I-7 zero billing', 100_000_000, 0, { subtotal: 0, retention: 0, base: 0, vat: 0, ewt: 0, net: 0 }],
    ['I-8 100% in one billing', 100_000_000, 10000, { subtotal: 100_000_000, retention: 10_000_000, base: 90_000_000, vat: 10_800_000, ewt: 1_800_000, net: 99_000_000 }],
  ]

  it.each(cases)('%s', (_name, tcv, billBps, expected) => {
    expect(invoice(tcv, billBps)).toEqual({ ...expected, vatBps: 1200 })
  })

  it('TAX_DEFAULTS passed as the rates gives the same I-1 result', () => {
    expect(computeProgressInvoice(100_000_000, 2500, TAX_DEFAULTS).net).toBe(24_750_000)
  })
})

describe('C-2 half-up ties (C-0: halfUp(n, d) = (2n + d) div 2d)', () => {
  it('retention 0.5 rounds up (I-3: 5 × 10% = 0.5 → 1)', () => {
    expect(computeRetention(5, 1000)).toBe(1)
  })

  it('EWT 0.5 rounds up (I-4: 25 × 2% = 0.5 → 1; PO-2)', () => {
    expect(computeEWT(25, 200)).toBe(1)
  })

  it('real ties round up: retention 123,456.5 → 123,457; EWT 18,000.5 → 18,001; EWT 24,691.5 → 24,692', () => {
    expect(computeRetention(1_234_565, 1000)).toBe(123_457)
    expect(computeEWT(900_025, 200)).toBe(18_001)
    expect(computeEWT(1_234_575, 200)).toBe(24_692)
  })

  it('VAT at 1200 bps never ties, so a VAT tie needs another rate (C-2 note): 4 × 12.5% = 0.5 → 1', () => {
    expect(computeVAT(4, 1250)).toBe(1)
    expect(computeVAT(12, 1250)).toBe(2) // 1.5 → 2
    expect(computeVAT(10, 500)).toBe(1) // 0.5 → 1
  })

  it('just below a tie rounds down: 0.48 → 0, 0.08 → 0 (I-3 VAT and EWT)', () => {
    expect(computeVAT(4, 1200)).toBe(0)
    expect(computeEWT(4, 200)).toBe(0)
  })
})

describe('C-2 retention across progress billings (PB-1..PB-4), default path', () => {
  const TCV = 987_654_321
  const billings: Array<[string, number, InvoiceExpectation, number]> = [
    ['PB-1 1st billing', 2000, { subtotal: 197_530_864, retention: 19_753_086, base: 177_777_778, vat: 21_333_333, ewt: 3_555_556, net: 195_555_555 }, 19_753_086],
    ['PB-2 2nd billing', 1750, { subtotal: 172_839_506, retention: 17_283_951, base: 155_555_555, vat: 18_666_667, ewt: 3_111_111, net: 171_111_111 }, 37_037_037],
    ['PB-3 3rd billing', 3000, { subtotal: 296_296_296, retention: 29_629_630, base: 266_666_666, vat: 32_000_000, ewt: 5_333_333, net: 293_333_333 }, 66_666_667],
  ]

  it('each billing bills its own share of TCV; held retention is the sum of stored R', () => {
    let billedBps = 0
    let held = 0
    for (const [name, billBps, expected, heldToDate] of billings) {
      expect(cumulativeBillingCapError(billedBps, billBps), name).toBeNull()
      const result = invoice(TCV, billBps)
      expect(result, name).toEqual({ ...expected, vatBps: 1200 })
      billedBps += billBps
      held += result.retention
      expect(held, name).toBe(heldToDate)
    }
    expect(billedBps).toBe(6750)
  })

  it('PB-4 a 4th billing of 3300 bps (cumulative 10050) is refused by the D-6 100% cap; held stays 66,666,667', () => {
    const error = cumulativeBillingCapError(6750, 3300)
    expect(error).not.toBeNull()
    expect(error).toContain('67.50% already billed')
    expect(error).toContain('32.50% remaining')
  })

  it('the cap allows exactly 100% and refuses one bps more', () => {
    expect(cumulativeBillingCapError(6750, 3250)).toBeNull()
    expect(cumulativeBillingCapError(10000, 1)).not.toBeNull()
  })
})

describe('C-2 progress invoice, profile path (P-1..P-4)', () => {
  it('P-1 VAT 1200, EWT 100, retention 500, VAT-registered', () => {
    expect(invoice(100_000_000, 2500, { vatBps: 1200, ewtBps: 100, retentionBps: 500, vatRegistered: true })).toEqual({
      subtotal: 25_000_000, retention: 1_250_000, base: 23_750_000, vat: 2_850_000, ewt: 237_500, net: 26_362_500, vatBps: 1200,
    })
  })

  it('P-2 non-VAT tenant: VAT 0 and applied vatBps 0; EWT and retention still apply (AC-TEN-08, D-TEN-2)', () => {
    expect(invoice(100_000_000, 2500, { vatBps: 1200, ewtBps: 200, retentionBps: 1000, vatRegistered: false })).toEqual({
      subtotal: 25_000_000, retention: 2_500_000, base: 22_500_000, vat: 0, ewt: 450_000, net: 22_050_000, vatBps: 0,
    })
  })

  it('P-3 zero retention', () => {
    expect(invoice(100_000_000, 2500, { vatBps: 1200, ewtBps: 200, retentionBps: 0, vatRegistered: true })).toEqual({
      subtotal: 25_000_000, retention: 0, base: 25_000_000, vat: 3_000_000, ewt: 500_000, net: 27_500_000, vatBps: 1200,
    })
  })

  it('P-4 profile retention 500 on the PB-1 inputs', () => {
    expect(invoice(987_654_321, 2000, { vatBps: 1200, ewtBps: 200, retentionBps: 500, vatRegistered: true })).toEqual({
      subtotal: 197_530_864, retention: 9_876_543, base: 187_654_321, vat: 22_518_519, ewt: 3_753_086, net: 206_419_754, vatBps: 1200,
    })
  })

  it('a resolved EffectiveTaxRates object (from the picker) drives the same P-1 amounts', () => {
    const resolved = pickEffectiveTaxRates([profile({ code: 'P1' })], '2026-11-04')
    expect(computeProgressInvoice(100_000_000, 2500, resolved).net).toBe(26_362_500)
  })
})

describe('C-3 purchase order math (PO-1..PO-7) with the shared half-up helpers', () => {
  function po(subtotal: number, vatBps: number, ewtBps: number) {
    const vat = computeVAT(subtotal, vatBps)
    const ewt = computeEWT(subtotal, ewtBps)
    return { vat, ewt, total: subtotal + vat - ewt }
  }

  it.each([
    ['PO-1 messy, defaults', 899_883, 1200, 200, { vat: 107_986, ewt: 17_998, total: 989_871 }],
    ['PO-2 tie, tiny, defaults', 25, 1200, 200, { vat: 3, ewt: 1, total: 27 }],
    ['PO-3 round, defaults', 10_000_000, 1200, 200, { vat: 1_200_000, ewt: 200_000, total: 11_000_000 }],
    ['PO-5 tie, real, defaults', 1_234_575, 1200, 200, { vat: 148_149, ewt: 24_692, total: 1_358_032 }],
    ['PO-7 profile EWT 1%', 899_883, 1200, 100, { vat: 107_986, ewt: 8_999, total: 998_870 }],
  ] as const)('%s', (_name, subtotal, vatBps, ewtBps, expected) => {
    expect(po(subtotal, vatBps, ewtBps)).toEqual(expected)
  })

  it('PO-4 built from lines: P is the sum of line totals, then VAT/EWT once per document', () => {
    const lines = [
      { quantity: 120, unitCents: 28_550 },
      { quantity: 2_500, unitCents: 1_875 },
      { quantity: 37, unitCents: 51_235 },
    ]
    const lineTotals = lines.map((line) => line.quantity * line.unitCents)
    expect(lineTotals).toEqual([3_426_000, 4_687_500, 1_895_695])
    const subtotal = lineTotals.reduce((sum, value) => sum + value, 0)
    expect(subtotal).toBe(10_009_195)
    expect(po(subtotal, 1200, 200)).toEqual({ vat: 1_201_103, ewt: 200_184, total: 11_010_114 })
  })
})

describe('C-5 previews (PV-1..PV-3)', () => {
  it('PV-1 invoice form preview equals I-2 (N 407,366)', () => {
    expect(invoice(1_234_567, 3333).net).toBe(407_366)
  })

  it('PV-2 PO form preview: VAT 148,149, EWT 24,692, total 1,358,032; the old Math.round gives the same', () => {
    const subtotal = 1_234_575
    expect(computeVAT(subtotal, TAX_DEFAULTS.vatBps)).toBe(148_149)
    expect(computeEWT(subtotal, TAX_DEFAULTS.ewtBps)).toBe(24_692)
    expect(Math.round(subtotal * 0.12)).toBe(148_149)
    expect(Math.round(subtotal * 0.02)).toBe(24_692)
  })

  it('PV-3 portal BOM summary keeps its own formula: VAT and retention on full TCV, no EWT', () => {
    const tcv = 1_234_565
    const vat = computeVAT(tcv, TAX_DEFAULTS.vatBps)
    const retention = computeRetention(tcv, TAX_DEFAULTS.retentionBps)
    expect(vat).toBe(148_148)
    expect(retention).toBe(123_457)
    expect(tcv + vat - retention).toBe(1_259_256)
  })
})

// Seeded PRNG so the property test is deterministic.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('AC-TEN-13 property: shared half-up at defaults equals today\'s float Math.round', () => {
  it('every subtotal 0..3,000,000', () => {
    let mismatches = 0
    for (let s = 0; s <= 3_000_000; s += 1) {
      if (computeVAT(s) !== Math.round(s * 0.12)) mismatches += 1
      if (computeEWT(s) !== Math.round(s * 0.02)) mismatches += 1
      if (computeRetention(s) !== Math.round(s * 0.1)) mismatches += 1
    }
    expect(mismatches).toBe(0)
  }, 120_000)

  it('2,000,000 seeded random subtotals below 10^13 centavos', () => {
    const random = mulberry32(20261105)
    let mismatches = 0
    for (let i = 0; i < 2_000_000; i += 1) {
      const s = Math.floor(random() * 1_000_000) * 10_000_000 + Math.floor(random() * 10_000_000)
      if (computeVAT(s) !== Math.round(s * 0.12)) mismatches += 1
      if (computeEWT(s) !== Math.round(s * 0.02)) mismatches += 1
      if (computeRetention(s) !== Math.round(s * 0.1)) mismatches += 1
    }
    expect(mismatches).toBe(0)
  }, 120_000)

  it('invoice identity N = B + V − W and B = S − R holds for random inputs and any rates', () => {
    const random = mulberry32(7)
    for (let i = 0; i < 5_000; i += 1) {
      const tcv = Math.floor(random() * 10_000_000_000)
      const billBps = Math.floor(random() * 10_001)
      const r = {
        vatBps: Math.floor(random() * 10_001),
        ewtBps: Math.floor(random() * 10_001),
        retentionBps: Math.floor(random() * 10_001),
        vatRegistered: random() < 0.5,
      }
      const result = computeProgressInvoice(tcv, billBps, r)
      expect(result.base).toBe(result.subtotal - result.retention)
      expect(result.net).toBe(result.base + result.vat - result.ewt)
      if (!r.vatRegistered) expect(result.vat).toBe(0)
      expect(result.net).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('C-4 formatBps', () => {
  it.each([
    [1200, '12%'],
    [200, '2%'],
    [1000, '10%'],
    [0, '0%'],
    [1250, '12.5%'],
    [125, '1.25%'],
    [10000, '100%'],
  ])('%i bps → %s', (bps, label) => {
    expect(formatBps(bps)).toBe(label)
  })

  it('TAX_DEFAULTS labels equal today\'s label text (AC-TEN-11)', () => {
    expect(`VAT (${formatBps(TAX_DEFAULTS.vatBps)})`).toBe('VAT (12%)')
    expect(`Withholding Tax (${formatBps(TAX_DEFAULTS.ewtBps)})`).toBe('Withholding Tax (2%)')
    expect(`Retention (${formatBps(TAX_DEFAULTS.retentionBps)})`).toBe('Retention (10%)')
  })

  it('does not round 1250 to "13%" the way (bps / 100).toFixed(0) does', () => {
    expect((1250 / 100).toFixed(0)).toBe('13')
    expect(formatBps(1250)).toBe('12.5%')
  })

  it('plan §7.1: refuses non-integer or out-of-range bps', () => {
    expect(() => formatBps(12.5)).toThrow(RangeError)
    expect(() => formatBps(-1)).toThrow(RangeError)
    expect(() => formatBps(10001)).toThrow(RangeError)
  })
})

describe('§12 audit payloads (D-TEN-2 split)', () => {
  const profiled = rates({
    vatBps: 1200,
    ewtBps: 200,
    retentionBps: 1000,
    vatRegistered: false,
    source: 'profile',
    profileId: '11111111-1111-4111-8111-111111111111',
    profileCode: 'NONVAT',
    asOf: '2026-11-05',
  })

  it('AC-TEN-06 invoice audit on the default path records 1200/200/1000, VAT-registered, source default', () => {
    expect(invoiceTaxAudit(rates({ asOf: '2026-11-05' }))).toEqual({
      vatBps: 1200,
      ewtBps: 200,
      retentionBps: 1000,
      vatRegistered: true,
      source: 'default',
      profileId: null,
      profileCode: null,
      asOf: '2026-11-05',
    })
  })

  it('AC-TEN-08 invoice audit for a non-VAT profile records vatBps 0', () => {
    expect(invoiceTaxAudit(profiled)).toEqual({
      vatBps: 0,
      ewtBps: 200,
      retentionBps: 1000,
      vatRegistered: false,
      source: 'profile',
      profileId: profiled.profileId,
      profileCode: 'NONVAT',
      asOf: '2026-11-05',
    })
  })

  it('AC-TEN-10 PO audit ignores the tenant VAT flag and carries no retention', () => {
    const audit = purchaseOrderTaxAudit(profiled)
    expect(audit).toMatchObject({
      vatBps: 1200,
      ewtBps: 200,
      source: 'profile',
      profileId: profiled.profileId,
      profileCode: 'NONVAT',
      asOf: '2026-11-05',
    })
    expect(audit).not.toHaveProperty('retentionBps')
  })
})
