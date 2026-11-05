import { describe, expect, it } from 'vitest'
import {
  TAX_DEFAULTS,
  TaxProfileOverlapError,
  formatBps,
  invoiceTaxAudit,
  pickEffectiveTaxRates,
  purchaseOrderTaxAudit,
  type TaxProfileCandidate,
} from '../tax-rates'

function profile(overrides: Partial<TaxProfileCandidate>): TaxProfileCandidate {
  return {
    id: 'profile-a',
    code: 'A',
    status: 'active',
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    vat_rate_bps: 1200,
    withholding_rate_bps: 100,
    retention_rate_bps: 500,
    vat_registered: true,
    ...overrides,
  }
}

const DEFAULT_RESULT = {
  vatBps: 1200,
  ewtBps: 200,
  retentionBps: 1000,
  vatRegistered: true,
  source: 'default',
  profileId: null,
  profileCode: null,
}

describe('TAX_DEFAULTS', () => {
  it('holds the single definition of the default rates and is frozen', () => {
    expect(TAX_DEFAULTS).toEqual({
      vatBps: 1200,
      ewtBps: 200,
      retentionBps: 1000,
      vatRegistered: true,
    })
    expect(Object.isFrozen(TAX_DEFAULTS)).toBe(true)
  })
})

describe('pickEffectiveTaxRates (C-1)', () => {
  it('R-1: no profiles → defaults', () => {
    expect(pickEffectiveTaxRates([], '2026-11-04')).toEqual({
      ...DEFAULT_RESULT,
      asOf: '2026-11-04',
    })
  })

  it('R-2: an active profile in force → that profile', () => {
    expect(pickEffectiveTaxRates([profile({})], '2026-11-04')).toEqual({
      vatBps: 1200,
      ewtBps: 100,
      retentionBps: 500,
      vatRegistered: true,
      source: 'profile',
      profileId: 'profile-a',
      profileCode: 'A',
      asOf: '2026-11-04',
    })
  })

  it('R-3: an expired profile is ignored', () => {
    const rows = [profile({ valid_to: '2026-10-31' })]
    expect(pickEffectiveTaxRates(rows, '2026-11-04').source).toBe('default')
  })

  it('R-4: the last day is inclusive', () => {
    const rows = [profile({ valid_to: '2026-11-04' })]
    expect(pickEffectiveTaxRates(rows, '2026-11-04').profileCode).toBe('A')
  })

  it('R-5: a future profile applies from its first day, inclusive', () => {
    const rows = [
      profile({ id: 'profile-b', code: 'B', valid_from: '2027-01-01', valid_to: null }),
    ]
    expect(pickEffectiveTaxRates(rows, '2026-12-31').source).toBe('default')
    expect(pickEffectiveTaxRates(rows, '2027-01-01')).toMatchObject({
      source: 'profile',
      profileId: 'profile-b',
      profileCode: 'B',
    })
  })

  it('R-6: draft and retired profiles are ignored', () => {
    const rows = [
      profile({ status: 'draft' }),
      profile({ id: 'profile-c', code: 'C', status: 'retired' }),
    ]
    expect(pickEffectiveTaxRates(rows, '2026-11-04')).toEqual({
      ...DEFAULT_RESULT,
      asOf: '2026-11-04',
    })
  })

  it('R-7: two active profiles covering the date fail closed with sorted codes', () => {
    const rows = [
      profile({ id: 'profile-c', code: 'C' }),
      profile({ id: 'profile-a', code: 'A', valid_to: null }),
    ]
    let error: unknown
    try {
      pickEffectiveTaxRates(rows, '2026-11-04')
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(TaxProfileOverlapError)
    const overlap = error as TaxProfileOverlapError
    expect(overlap.code).toBe('TAX_PROFILE_OVERLAP')
    expect(overlap.profileCodes).toEqual(['A', 'C'])
    expect(overlap.asOf).toBe('2026-11-04')
    expect(overlap.message).toBe(
      'TAX_PROFILE_OVERLAP: active tax profiles A, C all cover 2026-11-04',
    )
  })

  it('uses stored retention 0, never a fallback (P-3)', () => {
    const rows = [profile({ retention_rate_bps: 0 })]
    expect(pickEffectiveTaxRates(rows, '2026-11-04').retentionBps).toBe(0)
  })
})

describe('formatBps (C-4)', () => {
  it.each([
    [1200, '12%'],
    [200, '2%'],
    [1000, '10%'],
    [0, '0%'],
    [1250, '12.5%'],
    [125, '1.25%'],
    [10000, '100%'],
    [5, '0.05%'],
  ])('%i bps → %s', (bps, label) => {
    expect(formatBps(bps)).toBe(label)
  })

  it('labels the defaults exactly as today', () => {
    expect(formatBps(TAX_DEFAULTS.vatBps)).toBe('12%')
    expect(formatBps(TAX_DEFAULTS.ewtBps)).toBe('2%')
    expect(formatBps(TAX_DEFAULTS.retentionBps)).toBe('10%')
  })

  it.each([-1, 10001, 12.5, Number.NaN])('rejects %s', (bps) => {
    expect(() => formatBps(bps)).toThrow(RangeError)
  })
})

describe('audit blocks (§12)', () => {
  const defaults = pickEffectiveTaxRates([], '2026-11-05')
  const nonVat = pickEffectiveTaxRates(
    [profile({ vat_registered: false, withholding_rate_bps: 200, retention_rate_bps: 1000 })],
    '2026-11-05',
  )

  it('invoice block records the default source', () => {
    expect(invoiceTaxAudit(defaults)).toEqual({
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

  it('invoice block records VAT 0 for a non-VAT tenant (P-2)', () => {
    expect(invoiceTaxAudit(nonVat)).toMatchObject({
      vatBps: 0,
      vatRegistered: false,
      source: 'profile',
      profileId: 'profile-a',
      profileCode: 'A',
    })
  })

  it('PO block ignores the tenant VAT flag (PO-6)', () => {
    expect(purchaseOrderTaxAudit(nonVat)).toEqual({
      vatBps: 1200,
      ewtBps: 200,
      source: 'profile',
      profileId: 'profile-a',
      profileCode: 'A',
      asOf: '2026-11-05',
    })
  })
})
