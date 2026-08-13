import { describe, expect, it } from 'vitest'
import {
  cancelRfqCommandSchema,
  completeRfqCommandSchema,
  awardRfqQuoteCommandSchema,
  logRfqQuoteCommandSchema,
  rfqAwardResultSchema,
  rfqTransitionResultSchema,
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
        priceHistoryId: UUID,
      }).success
    ).toBe(true)
    expect(
      rfqQuoteResultSchema.safeParse({
        quoteId: UUID,
        created: true,
        statusChanged: true,
        priceHistoryId: UUID,
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('accepts a strict award command/result without client authority fields', () => {
    expect(awardRfqQuoteCommandSchema.parse({})).toEqual({})
    expect(
      awardRfqQuoteCommandSchema.safeParse({ tenantId: UUID }).success,
    ).toBe(false)
    expect(
      rfqAwardResultSchema.parse({
        rfqId: UUID,
        quoteId: UUID,
        tenantId: UUID,
        priceHistoryId: UUID,
        awarded: true,
      }),
    ).toEqual({
      rfqId: UUID,
      quoteId: UUID,
      tenantId: UUID,
      priceHistoryId: UUID,
      awarded: true,
    })
  })

  it('accepts strict terminal RFQ commands and rejects authority injection', () => {
    expect(completeRfqCommandSchema.safeParse({}).success).toBe(true)
    expect(
      completeRfqCommandSchema.safeParse({ tenantId: UUID }).success
    ).toBe(false)
    expect(
      cancelRfqCommandSchema.parse({ reason: 'Supplier withdrew' })
    ).toEqual({ reason: 'Supplier withdrew' })
    expect(
      cancelRfqCommandSchema.safeParse({ reason: ' ' }).success
    ).toBe(false)
  })

  it('requires a tenant-scoped transition result', () => {
    expect(
      rfqTransitionResultSchema.safeParse({
        rfqId: UUID,
        tenantId: UUID,
        transitioned: true,
      }).success
    ).toBe(true)
    expect(
      rfqTransitionResultSchema.safeParse({
        rfqId: UUID,
        tenantId: UUID,
        transitioned: true,
        actorId: UUID,
      }).success
    ).toBe(false)
  })
})
