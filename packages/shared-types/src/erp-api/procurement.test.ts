import { describe, expect, it } from 'vitest'
import {
  createRfqCommandSchema,
  logRfqQuoteCommandSchema,
  rfqCreationResultSchema,
  rfqQuoteResultSchema,
  rfqTransitionResultSchema,
  transitionRfqCommandSchema,
} from './procurement'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('RFQ creation API contracts', () => {
  it('accepts only a BOM identifier from the caller', () => {
    expect(createRfqCommandSchema.parse({ bomId: UUID })).toEqual({
      bomId: UUID,
    })
    expect(
      createRfqCommandSchema.safeParse({
        bomId: UUID,
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('requires a strict durable creation result', () => {
    const result = {
      rfqId: UUID,
      tenantId: UUID,
      projectId: UUID,
      lineCount: 2,
      created: true,
    }
    expect(rfqCreationResultSchema.safeParse(result).success).toBe(
      true
    )
    expect(
      rfqCreationResultSchema.safeParse({
        ...result,
        source: 'manual',
      }).success
    ).toBe(false)
    expect(
      rfqCreationResultSchema.safeParse({
        ...result,
        lineCount: -1,
      }).success
    ).toBe(false)
  })
})

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

describe('RFQ terminal transition API contracts', () => {
  it('accepts only canonical complete and bounded cancel commands', () => {
    expect(
      transitionRfqCommandSchema.parse({ command: 'complete' })
    ).toEqual({ command: 'complete' })
    expect(
      transitionRfqCommandSchema.parse({
        command: 'cancel',
        reason: '  Supplier withdrew  ',
      })
    ).toEqual({
      command: 'cancel',
      reason: 'Supplier withdrew',
    })
  })

  it('rejects missing reasons and caller-supplied authority', () => {
    expect(
      transitionRfqCommandSchema.safeParse({
        command: 'cancel',
        reason: ' ',
      }).success
    ).toBe(false)
    expect(
      transitionRfqCommandSchema.safeParse({
        command: 'complete',
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('requires a strict durable transition result', () => {
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
        transitioned: false,
      }).success
    ).toBe(false)
  })
})
