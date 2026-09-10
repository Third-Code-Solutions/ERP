import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VendorPerformanceTable } from './vendor-performance-table'

const RESULT = {
  asOf: '2026-09-10T00:00:00.000Z',
  projectId: null,
  rows: [{
    vendorId: '44444444-4444-4444-8444-444444444444',
    vendorName: 'Concrete Supply',
    poCount: 2,
    issuedPoCount: 2,
    openPoCount: 1,
    committedCents: 125_000,
    deliveryCount: 2,
    acceptedDeliveryCount: 1,
    rejectedDeliveryCount: 1,
    onTimeDeliveryCount: 1,
    onTimeRateBps: 5_000,
    acceptanceRateBps: 5_000,
    averageLeadTimeDays: 6,
    supplierBillCount: 2,
    postedBillCount: 1,
    postedSpendCents: 75_000,
    risk: 'at_risk' as const,
    notes: ['At least one delivery was rejected.'],
  }],
  totals: {
    vendorCount: 1,
    vendorsWithOrders: 1,
    atRiskCount: 1,
    committedCents: 125_000,
    postedSpendCents: 75_000,
  },
}

describe('VendorPerformanceTable', () => {
  it('renders explainable evidence and preserves the at-risk signal', () => {
    const markup = renderToStaticMarkup(<VendorPerformanceTable result={RESULT} />)
    expect(markup).toContain('Concrete Supply')
    expect(markup).toContain('At risk')
    expect(markup).toContain('50%')
    expect(markup).toContain('At least one delivery')
    expect(markup).toContain('₱1,250.00')
  })
})
