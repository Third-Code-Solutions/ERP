import { describe, expect, it } from 'vitest'
import {
  logRfqQuoteCommandSchema,
  rfqQuoteResultSchema,
} from './procurement'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('RFQ quote API contracts', () => {
  it('accepts the bounded canonical quote command', () => {
    expect(
      logRfqQuoteCommandSchema.parse({
        submissionId: UUID,
        bomLineItemId: UUID,
        vendorId: UUID,
        unitPriceCents: 12_345,
        leadTimeDays: 7,
        validUntil: '2026-08-31T00:00:00.000Z',
        notes: '  Delivered to site  ',
      })
    ).toEqual({
      submissionId: UUID,
      bomLineItemId: UUID,
      vendorId: UUID,
      unitPriceCents: 12_345,
      leadTimeDays: 7,
      validUntil: '2026-08-31T00:00:00.000Z',
      notes: 'Delivered to site',
    })
  })

  it('rejects unknown authority and unsafe money', () => {
    expect(
      logRfqQuoteCommandSchema.safeParse({
        submissionId: UUID,
        bomLineItemId: UUID,
        vendorId: UUID,
        unitPriceCents: Number.MAX_SAFE_INTEGER + 1,
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('requires a strict durable result', () => {
    expect(
      rfqQuoteResultSchema.safeParse({
        quoteId: UUID,
        created: true,
        statusChanged: true,
      }).success
    ).toBe(true)
    expect(
      rfqQuoteResultSchema.safeParse({
        quoteId: UUID,
        created: true,
        statusChanged: true,
        tenantId: UUID,
      }).success
    ).toBe(false)
  })
})
