import { describe, expect, it } from 'vitest'
import { withholdingRateLabel, withholdingTaxBaseCents } from './invoice-print'

describe('withholding on a printed invoice', () => {
  it('takes the base net of retention', () => {
    expect(withholdingTaxBaseCents({ subtotal_cents: 25_000_000, retention_cents: 2_500_000 })).toBe(22_500_000)
    expect(withholdingTaxBaseCents({ subtotal_cents: 100, retention_cents: 500 })).toBe(0)
  })

  it('labels the rate from the stored amounts, not the default rate', () => {
    const base = { subtotal_cents: 25_000_000, retention_cents: 2_500_000 }
    expect(withholdingRateLabel({ ...base, withholding_tax_cents: 450_000 })).toBe('2%')
    // A tenant profile at 1.5% stores 1.5% of the base.
    expect(withholdingRateLabel({ ...base, withholding_tax_cents: 337_500 })).toBe('1.5%')
    // Rounded to whole basis points (two decimals of a percent).
    expect(withholdingRateLabel({ subtotal_cents: 100_001, retention_cents: 0, withholding_tax_cents: 2_000 })).toBe('2%')
  })

  it('prints no rate when there is no base or the stored amounts are out of range', () => {
    expect(withholdingRateLabel({ subtotal_cents: 0, retention_cents: 0, withholding_tax_cents: 0 })).toBe('—')
    expect(withholdingRateLabel({ subtotal_cents: 100, retention_cents: 0, withholding_tax_cents: 200 })).toBe('—')
  })
})
