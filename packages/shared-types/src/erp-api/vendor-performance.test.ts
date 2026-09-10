import { describe, expect, it } from 'vitest'
import {
  buildVendorPerformanceResult,
  deriveVendorPerformanceRow,
  vendorPerformanceQuerySchema,
} from './vendor-performance'

const VENDOR_ID = '11111111-1111-4111-8111-111111111111'

describe('vendor performance contract', () => {
  it('keeps rates explicit and marks rejected or late evidence at risk', () => {
    const row = deriveVendorPerformanceRow({
      vendorId: VENDOR_ID,
      vendorName: 'Concrete Supply',
      poCount: 2,
      issuedPoCount: 2,
      openPoCount: 1,
      committedCents: 125_000,
      deliveryCount: 4,
      acceptedDeliveryCount: 3,
      rejectedDeliveryCount: 1,
      onTimeDeliveryCount: 2,
      averageLeadTimeDays: 6.4,
      supplierBillCount: 2,
      postedBillCount: 1,
      postedSpendCents: 75_000,
    })

    expect(row.onTimeRateBps).toBe(5_000)
    expect(row.acceptanceRateBps).toBe(7_500)
    expect(row.averageLeadTimeDays).toBe(6)
    expect(row.risk).toBe('at_risk')
    expect(row.notes).toEqual(expect.arrayContaining([
      'At least one delivery was rejected.',
      'Some supplier bills are not posted; spend is limited to posted evidence.',
    ]))
  })

  it('does not fabricate delivery performance for a vendor with no delivery history', () => {
    const result = buildVendorPerformanceResult(
      '2026-09-10T00:00:00.000Z',
      null,
      [{
        vendorId: VENDOR_ID,
        vendorName: 'New Vendor',
        poCount: 1,
        issuedPoCount: 0,
        openPoCount: 1,
        committedCents: 10_000,
        deliveryCount: 0,
        acceptedDeliveryCount: 0,
        rejectedDeliveryCount: 0,
        onTimeDeliveryCount: 0,
        averageLeadTimeDays: null,
        supplierBillCount: 0,
        postedBillCount: 0,
        postedSpendCents: 0,
      }],
    )

    expect(result.rows[0]?.onTimeRateBps).toBeNull()
    expect(result.rows[0]?.risk).toBe('watch')
    expect(result.totals.committedCents).toBe(10_000)
  })

  it('rejects unknown query fields', () => {
    expect(vendorPerformanceQuerySchema.safeParse({ projectId: VENDOR_ID }).success).toBe(true)
    expect(vendorPerformanceQuerySchema.safeParse({ tenantId: VENDOR_ID }).success).toBe(false)
  })
})
