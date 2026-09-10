import { describe, expect, it } from 'vitest'
import { buildRfqBidLevelingResult } from './rfq-bid-leveling'

const RFQ_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const VENDOR_A = '33333333-3333-4333-8333-333333333333'
const VENDOR_B = '44444444-4444-4444-8444-444444444444'
const QUOTE_A = '55555555-5555-4555-8555-555555555555'
const QUOTE_B = '66666666-6666-4666-8666-666666666666'

describe('RFQ bid-leveling projection', () => {
  it('marks the lowest price and stale quote without choosing a winner', () => {
    const result = buildRfqBidLevelingResult(
      RFQ_ID,
      PROJECT_ID,
      'quotes_received',
      [{
        bomLineItemId: '77777777-7777-4777-8777-777777777777',
        materialItemId: '88888888-8888-4888-8888-888888888888',
        code: 'CEM-001',
        description: 'Cement',
        quantity: 10,
        unit: 'bag',
      }],
      [
        {
          quoteId: QUOTE_A,
          bomLineItemId: '77777777-7777-4777-8777-777777777777',
          materialItemId: '88888888-8888-4888-8888-888888888888',
          materialCode: 'CEM-001',
          vendorId: VENDOR_A,
          vendorName: 'Alpha Supply',
          unitPriceCents: 120_000,
          leadTimeDays: 5,
          validUntil: new Date('2026-09-30T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          isAwarded: false,
        },
        {
          quoteId: QUOTE_B,
          bomLineItemId: '77777777-7777-4777-8777-777777777777',
          materialItemId: '88888888-8888-4888-8888-888888888888',
          materialCode: 'CEM-001',
          vendorId: VENDOR_B,
          vendorName: 'Beta Supply',
          unitPriceCents: 110_000,
          leadTimeDays: 7,
          validUntil: new Date('2026-09-05T00:00:00.000Z'),
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          isAwarded: false,
        },
      ],
      new Date('2026-09-10T00:00:00.000Z'),
    )

    expect(result.coveredLineCount).toBe(1)
    expect(result.vendorCount).toBe(2)
    expect(result.staleQuoteCount).toBe(1)
    expect(result.lines[0]?.lowestUnitPriceCents).toBe(110_000)
    expect(result.lines[0]?.quotes.find((quote) => quote.quoteId === QUOTE_B)).toMatchObject({
      isLowestPrice: true,
      isStale: true,
    })
    expect(result.awardedQuoteCount).toBe(0)
  })
})
