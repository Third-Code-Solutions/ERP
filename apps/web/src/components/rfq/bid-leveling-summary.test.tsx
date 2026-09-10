import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BidLevelingSummary } from './bid-leveling-summary'

const RESULT = {
  rfqId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  status: 'quotes_received' as const,
  asOf: '2026-09-10T00:00:00.000Z',
  staleAfterDays: 90 as const,
  lines: [{
    lineKey: '33333333-3333-4333-8333-333333333333',
    bomLineItemId: '33333333-3333-4333-8333-333333333333',
    materialItemId: null,
    code: 'CEM-001',
    description: 'Cement',
    quantity: 2,
    unit: 'bag',
    quotes: [{
      quoteId: '44444444-4444-4444-8444-444444444444',
      vendorId: '55555555-5555-4555-8555-555555555555',
      vendorName: 'Alpha Supply',
      unitPriceCents: 10_000,
      leadTimeDays: 4,
      validUntil: '2026-09-30T00:00:00.000Z',
      createdAt: '2026-09-10T00:00:00.000Z',
      ageDays: 0,
      isStale: false,
      isLowestPrice: true,
      isAwarded: false,
    }],
    lowestUnitPriceCents: 10_000,
  }],
  vendorCount: 1,
  coveredLineCount: 1,
  totalLineCount: 1,
  staleQuoteCount: 0,
  awardedQuoteCount: 0,
}

describe('BidLevelingSummary', () => {
  it('renders evidence without an automatic recommendation', () => {
    const markup = renderToStaticMarkup(<BidLevelingSummary result={RESULT} />)
    expect(markup).toContain('Bid-leveling evidence')
    expect(markup).toContain('Covered lines')
    expect(markup).toContain('₱100.00')
    expect(markup).toContain('No automatic winner')
  })
})
