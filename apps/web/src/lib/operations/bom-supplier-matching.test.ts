import { describe, expect, it } from 'vitest'
import {
  isPriceHistoryStale,
  selectCanonicalSupplierOptions,
} from './bom-supplier-matching'

describe('selectCanonicalSupplierOptions', () => {
  it('keeps the newest catalog-linked price per vendor', () => {
    const options = selectCanonicalSupplierOptions([
      {
        id: 'new-award',
        vendor_id: 'vendor-a',
        vendor_name: 'Supplier A',
        quoted_rate_centavos: 1200n,
        awarded_rate_centavos: 1100n,
        source_type: 'award',
        occurred_at: '2026-08-12',
      },
      {
        id: 'old-quote',
        vendor_id: 'vendor-a',
        vendor_name: 'Supplier A',
        quoted_rate_centavos: 900n,
        awarded_rate_centavos: null,
        source_type: 'quote',
        occurred_at: '2026-07-01',
      },
      {
        id: 'quote-b',
        vendor_id: 'vendor-b',
        vendor_name: 'Supplier B',
        quoted_rate_centavos: '1300',
        awarded_rate_centavos: null,
        source_type: 'quote',
        occurred_at: '2026-08-10',
      },
      {
        id: 'unassigned',
        vendor_id: null,
        vendor_name: null,
        quoted_rate_centavos: 1,
        awarded_rate_centavos: null,
        source_type: 'manual',
        occurred_at: '2026-08-10',
      },
    ])

    expect(options).toHaveLength(2)
    expect(options[0]).toMatchObject({
      id: 'new-award',
      vendor_id: 'vendor-a',
      unit_price_cents: 1100,
      is_preferred: true,
      source_type: 'award',
      occurred_at: '2026-08-12',
      is_stale: false,
    })
    expect(options[1]).toMatchObject({
      id: 'quote-b',
      vendor_id: 'vendor-b',
      unit_price_cents: 1300,
      is_preferred: false,
    })
  })

  it('marks prices older than 90 days stale at date boundaries', () => {
    expect(
      isPriceHistoryStale('2026-05-01', new Date('2026-08-01T12:00:00.000Z')),
    ).toBe(true)
    expect(
      isPriceHistoryStale('2026-05-03', new Date('2026-08-01T12:00:00.000Z')),
    ).toBe(false)
  })
})
