import { describe, expect, it } from 'vitest'
import {
  deliveryReceiptCommandSchema,
  deliveryReceiptResultSchema,
} from './deliveries'

describe('delivery receipt contracts', () => {
  it('accepts only bounded receipt notes', () => {
    expect(deliveryReceiptCommandSchema.parse({ notes: 'DR-42' })).toEqual({
      notes: 'DR-42',
    })
    expect(deliveryReceiptCommandSchema.parse({})).toEqual({})
    expect(
      deliveryReceiptCommandSchema.safeParse({ tenantId: 'not-browser-authority' })
        .success
    ).toBe(false)
    expect(
      deliveryReceiptCommandSchema.safeParse({ notes: 'x'.repeat(2_001) })
        .success
    ).toBe(false)
  })

  it('returns a strict tenant-scoped transition result', () => {
    expect(
      deliveryReceiptResultSchema.parse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        action: 'record_receipt',
        fromStatus: 'in_transit',
        status: 'received',
      })
    ).toMatchObject({ action: 'record_receipt', status: 'received' })
    expect(
      deliveryReceiptResultSchema.safeParse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        action: 'record_receipt',
        fromStatus: 'accepted',
        status: 'received',
      }).success
    ).toBe(false)
  })
})
