import { describe, expect, it } from 'vitest'
import {
  deliveryReceiptCommandSchema,
  deliveryReceiptResultSchema,
  deliveryInspectionCompleteCommandSchema,
  deliveryInspectionCompleteResultSchema,
  deliveryStartInspectionCommandSchema,
  deliveryStartInspectionResultSchema,
  deliveryStartSitePreparationCommandSchema,
  deliveryStartSitePreparationResultSchema,
  deliveryCompleteSitePreparationCommandSchema,
  deliveryCompleteSitePreparationResultSchema,
  deliveryCancelCommandSchema,
  deliveryCancelResultSchema,
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

describe('delivery site-preparation start contracts', () => {
  it('accepts an empty command and rejects browser authority fields', () => {
    expect(deliveryStartSitePreparationCommandSchema.parse({})).toEqual({})
    expect(
      deliveryStartSitePreparationCommandSchema.safeParse({
        tenantId: '22222222-2222-4222-8222-222222222222',
      }).success
    ).toBe(false)
  })

  it('returns a strict scheduled-to-preparing transition result', () => {
    expect(
      deliveryStartSitePreparationResultSchema.parse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        action: 'start_site_preparation',
        fromStatus: 'scheduled',
        status: 'site_preparing',
      })
    ).toMatchObject({ action: 'start_site_preparation', status: 'site_preparing' })
    expect(
      deliveryStartSitePreparationResultSchema.safeParse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        action: 'start_site_preparation',
        fromStatus: 'site_preparing',
        status: 'site_preparing',
      }).success
    ).toBe(false)
  })
})

describe('delivery site-preparation completion contracts', () => {
  it('accepts bounded notes and rejects browser authority fields', () => {
    expect(
      deliveryCompleteSitePreparationCommandSchema.parse({
        notes: 'Staging bay cleared',
      })
    ).toMatchObject({ notes: 'Staging bay cleared' })
    expect(
      deliveryCompleteSitePreparationCommandSchema.safeParse({
        tenantId: 'browser-authority',
      }).success
    ).toBe(false)
    expect(
      deliveryCompleteSitePreparationCommandSchema.safeParse({
        notes: 'x'.repeat(4_001),
      }).success
    ).toBe(false)
  })

  it('returns a strict preparing-to-ready transition result', () => {
    expect(
      deliveryCompleteSitePreparationResultSchema.parse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        action: 'complete_site_preparation',
        fromStatus: 'site_preparing',
        status: 'site_ready',
        sitePreparedAt: '2026-08-02T12:00:00.000Z',
      })
    ).toMatchObject({
      action: 'complete_site_preparation',
      status: 'site_ready',
    })
    expect(
      deliveryCompleteSitePreparationResultSchema.safeParse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        action: 'complete_site_preparation',
        fromStatus: 'scheduled',
        status: 'site_ready',
        sitePreparedAt: '2026-08-02T12:00:00.000Z',
      }).success
    ).toBe(false)
  })
})

describe('delivery inspection completion contracts', () => {
  it('requires bounded result notes and failure evidence', () => {
    expect(
      deliveryInspectionCompleteCommandSchema.parse({
        result: 'partial_pass',
        defectNotes: 'Two brackets scratched',
        acceptanceNotes: 'Replace on next visit',
      })
    ).toMatchObject({ result: 'partial_pass' })
    expect(
      deliveryInspectionCompleteCommandSchema.safeParse({
        result: 'fail',
      }).success
    ).toBe(false)
    expect(
      deliveryInspectionCompleteCommandSchema.safeParse({
        result: 'pass',
        tenantId: 'browser-authority',
      }).success
    ).toBe(false)
    expect(
      deliveryInspectionCompleteCommandSchema.safeParse({
        result: 'pass',
        defectNotes: 'x'.repeat(4_001),
      }).success
    ).toBe(false)
  })

  it('returns a strict terminal delivery transition result', () => {
    expect(
      deliveryInspectionCompleteResultSchema.parse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        inspectionId: '44444444-4444-4444-8444-444444444444',
        action: 'complete_inspection',
        fromStatus: 'inspecting',
        inspectionResult: 'pass',
        status: 'accepted',
        completedAt: '2026-08-02T12:00:00.000Z',
      })
    ).toMatchObject({ action: 'complete_inspection', status: 'accepted' })
    expect(
      deliveryInspectionCompleteResultSchema.safeParse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        inspectionId: '44444444-4444-4444-8444-444444444444',
        action: 'complete_inspection',
        fromStatus: 'received',
        inspectionResult: 'fail',
        status: 'rejected',
        completedAt: '2026-08-02T12:00:00.000Z',
      }).success
    ).toBe(false)
  })
})

describe('delivery cancellation contracts', () => {
  it('requires a bounded reason and rejects browser authority fields', () => {
    expect(deliveryCancelCommandSchema.parse({ reason: 'Supplier delay' })).toEqual({
      reason: 'Supplier delay',
    })
    expect(deliveryCancelCommandSchema.safeParse({}).success).toBe(false)
    expect(
      deliveryCancelCommandSchema.safeParse({ reason: '   ' }).success
    ).toBe(false)
    expect(
      deliveryCancelCommandSchema.safeParse({
        reason: 'Supplier delay',
        tenantId: '22222222-2222-4222-8222-222222222222',
      }).success
    ).toBe(false)
    expect(
      deliveryCancelCommandSchema.safeParse({ reason: 'x'.repeat(4_001) })
        .success
    ).toBe(false)
  })

  it('returns a strict non-terminal to cancelled result', () => {
    expect(
      deliveryCancelResultSchema.parse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        action: 'cancel_delivery',
        fromStatus: 'in_transit',
        status: 'cancelled',
        cancellationReason: 'Supplier delay',
        cancelledAt: '2026-08-02T12:00:00.000Z',
      })
    ).toMatchObject({ action: 'cancel_delivery', status: 'cancelled' })
    expect(
      deliveryCancelResultSchema.safeParse({
        deliveryScheduleId: '33333333-3333-4333-8333-333333333333',
        tenantId: '22222222-2222-4222-8222-222222222222',
        action: 'cancel_delivery',
        fromStatus: 'accepted',
        status: 'cancelled',
        cancellationReason: 'Supplier delay',
        cancelledAt: '2026-08-02T12:00:00.000Z',
      }).success
    ).toBe(false)
  })
})
