import { describe, expect, it } from 'vitest'
import {
  deliveryReceiptCommandSchema,
  deliveryReceiptResultSchema,
  deliveryStartInspectionCommandSchema,
  deliveryStartInspectionResultSchema,
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

describe('delivery inspection start contracts', () => {
  it('accepts an empty command and rejects browser authority fields', () => {
    expect(deliveryStartInspectionCommandSchema.parse({})).toEqual({})
    expect(
      deliveryStartInspectionCommandSchema.safeParse({
        tenantId: '22222222-2222-4222-8222-222222222222',
      }).success
    ).toBe(false)
  })

  it('returns a strict inspection transition result', () => {
    expect(
      deliveryStartInspectionResultSchema.parse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        inspectionId: '44444444-4444-4444-8444-444444444444',
        action: 'start_inspection',
        fromStatus: 'received',
        status: 'inspecting',
      })
    ).toMatchObject({ action: 'start_inspection', status: 'inspecting' })
    expect(
      deliveryStartInspectionResultSchema.safeParse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        inspectionId: '44444444-4444-4444-8444-444444444444',
        action: 'start_inspection',
        fromStatus: 'in_transit',
        status: 'inspecting',
      }).success
    ).toBe(false)
  })
})
