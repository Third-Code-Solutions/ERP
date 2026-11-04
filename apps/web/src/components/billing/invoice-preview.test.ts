import { parsePercentToBps } from '@third-code-erp/shared-types/bom'
import { describe, expect, it } from 'vitest'
import { previewProgressInvoice } from './invoice-preview'

// D-15: the preview must equal the server draft (integer, half-up), never
// the old float math.
describe('previewProgressInvoice (D-15)', () => {
  it('normal: 25% of PHP 1,000,000.00', () => {
    expect(previewProgressInvoice(100_000_000, 2_500)).toEqual({
      subtotal: 25_000_000,
      retention: 2_500_000,
      vat: 2_700_000,
      ewt: 450_000,
      net: 24_750_000,
    })
  })

  it('boundaries: 0% bills nothing, 100% bills the full TCV', () => {
    expect(previewProgressInvoice(100_000_000, 0)).toEqual({
      subtotal: 0,
      retention: 0,
      vat: 0,
      ewt: 0,
      net: 0,
    })
    expect(previewProgressInvoice(100_000_000, 10_000)).toEqual({
      subtotal: 100_000_000,
      retention: 10_000_000,
      vat: 10_800_000,
      ewt: 1_800_000,
      net: 99_000_000,
    })
  })

  it('.5 tie rounds up where the float preview showed one centavo less', () => {
    // 0.29% of 25,000 = 72.5; old preview: Math.round(25000 * 0.29 * 100 / 10000) = 72
    expect(Math.round((25_000 * 0.29 * 100) / 10_000)).toBe(72)
    expect(previewProgressInvoice(25_000, 29)).toEqual({
      subtotal: 73,
      retention: 7,
      vat: 8,
      ewt: 1,
      net: 73,
    })
  })

  it('messy: 33.33% of PHP 1,234,567.89', () => {
    // 41,148,147.7737 -> 41,148,148; retention 4,114,814.8 -> 4,114,815;
    // VAT 4,443,999.96 -> 4,444,000; EWT 740,666.66 -> 740,667
    expect(previewProgressInvoice(123_456_789, 3_333)).toEqual({
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
    expect(previewProgressInvoice(100_000_000, bps ?? 0).subtotal).toBe(8_330_000)
  })
})
