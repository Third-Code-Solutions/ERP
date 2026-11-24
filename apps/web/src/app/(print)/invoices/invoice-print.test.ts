import { TaxProfileOverlapError } from '@third-code-erp/shared-types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ resolveTaxRates: vi.fn() }))

vi.mock('@third-code-erp/database', () => ({ db: {}, resolveTaxRates: mocks.resolveTaxRates }))

import {
  invoiceTaxBaseCents,
  vatRateLabel,
  vatRegisteredWhenDrafted,
  withholdingRateLabel,
} from './invoice-print'

const BASE = { subtotal_cents: 25_000_000, retention_cents: 2_500_000 }

describe('withholding on a printed invoice', () => {
  it('takes the base net of retention', () => {
    expect(invoiceTaxBaseCents(BASE)).toBe(22_500_000)
    expect(invoiceTaxBaseCents({ subtotal_cents: 100, retention_cents: 500 })).toBe(0)
  })

  it('labels the rate from the stored amounts, not the default rate', () => {
    expect(withholdingRateLabel({ ...BASE, withholding_tax_cents: 450_000 })).toBe('2%')
    // A tenant profile at 1.5% stores 1.5% of the base.
    expect(withholdingRateLabel({ ...BASE, withholding_tax_cents: 337_500 })).toBe('1.5%')
    // Rounded to whole basis points (two decimals of a percent).
    expect(withholdingRateLabel({ subtotal_cents: 100_001, retention_cents: 0, withholding_tax_cents: 2_000 })).toBe('2%')
  })

  it('prints no rate when there is no base or the stored amounts are out of range', () => {
    expect(withholdingRateLabel({ subtotal_cents: 0, retention_cents: 0, withholding_tax_cents: 0 })).toBe('—')
    expect(withholdingRateLabel({ subtotal_cents: 100, retention_cents: 0, withholding_tax_cents: 200 })).toBe('—')
  })
})

describe('VAT on a printed invoice', () => {
  it('labels the rate charged from the stored VAT, whatever the profile says now', () => {
    expect(vatRateLabel({ ...BASE, vat_cents: 2_700_000 }, null)).toBe('12%')
    expect(vatRateLabel({ ...BASE, vat_cents: 2_250_000 }, null)).toBe('10%')
    expect(vatRateLabel({ ...BASE, vat_cents: 2_250_000 }, false)).toBe('10%')
  })

  it('names why no VAT was charged, from the tax profile', () => {
    expect(vatRateLabel({ ...BASE, vat_cents: 0 }, false)).toBe('Non-VAT')
    expect(vatRateLabel({ ...BASE, vat_cents: 0 }, true)).toBe('VAT-exempt')
    // Profiles could not be read: print the stored rate, nothing more.
    expect(vatRateLabel({ ...BASE, vat_cents: 0 }, null)).toBe('0%')
    expect(vatRateLabel({ subtotal_cents: 0, retention_cents: 0, vat_cents: 0 }, true)).toBe('—')
  })
})

describe('vatRegisteredWhenDrafted', () => {
  const TENANT_ID = '22222222-2222-4222-8222-222222222222'
  const DRAFTED = new Date('2026-11-04T12:00:00.000Z')

  beforeEach(() => mocks.resolveTaxRates.mockReset())

  it('reads the tenant profile in force on the draft date', async () => {
    mocks.resolveTaxRates.mockResolvedValue({ vatRegistered: false })

    await expect(vatRegisteredWhenDrafted(TENANT_ID, DRAFTED)).resolves.toBe(false)
    expect(mocks.resolveTaxRates).toHaveBeenCalledWith(expect.anything(), TENANT_ID, DRAFTED)
  })

  it('returns null when profiles overlap and rethrows anything else', async () => {
    mocks.resolveTaxRates.mockRejectedValueOnce(new TaxProfileOverlapError(['A', 'B'], '2026-11-04'))
    await expect(vatRegisteredWhenDrafted(TENANT_ID, DRAFTED)).resolves.toBeNull()

    mocks.resolveTaxRates.mockRejectedValueOnce(new Error('connection reset'))
    await expect(vatRegisteredWhenDrafted(TENANT_ID, DRAFTED)).rejects.toThrow('connection reset')
  })
})
