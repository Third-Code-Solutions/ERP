import { describe, expect, it } from 'vitest'
import {
  costEntryDeletionResultSchema,
  costEntryRestoreResultSchema,
  costEntryCreationResultSchema,
  deleteCostEntryBodySchema,
  restoreCostEntryBodySchema,
  restoreCostEntryCommandSchema,
  createCostEntryCommandSchema,
} from './cost-entries'

const UUID = '33333333-3333-4333-8333-333333333333'

describe('Cost entry API contracts', () => {
  it('keeps money as positive integer centavos and rejects browser identity fields', () => {
    expect(
      createCostEntryCommandSchema.safeParse({
        costCodeId: UUID,
        costCategory: 'material',
        description: 'Concrete delivery',
        amountCents: 125_000,
        tenantId: UUID,
      }).success
    ).toBe(false)

    expect(
      createCostEntryCommandSchema.parse({
        costCodeId: UUID,
        costCategory: 'material',
        description: 'Concrete delivery',
        amountCents: 125_000,
      })
    ).toMatchObject({
      amountCents: 125_000,
      quantity: 1,
      unit: null,
      incurredAt: null,
    })
  })

  it('requires the stable authoritative result shape', () => {
    expect(
      costEntryCreationResultSchema.parse({
        id: UUID,
        tenantId: UUID,
        projectId: UUID,
        costCodeId: UUID,
        costCategory: 'material',
        costSource: 'manual',
        description: 'Concrete delivery',
        amountCents: 125_000,
        quantity: 1,
        unit: null,
        incurredAt: '2026-08-05T00:00:00.000Z',
        referenceNumber: null,
        notes: null,
        createdAt: '2026-08-05T00:00:00.000Z',
      }).costSource
    ).toBe('manual')
  })

  it('requires a bounded void reason and marks the result restorable', () => {
    expect(deleteCostEntryBodySchema.safeParse({ reason: '  ' }).success).toBe(
      false
    )
    expect(
      costEntryDeletionResultSchema.parse({
        costEntryId: UUID,
        tenantId: UUID,
        projectId: UUID,
        costSource: 'manual',
        status: 'voided',
        voidedAt: '2026-08-07T00:00:00.000Z',
        restorable: true,
      })
    ).toMatchObject({ status: 'voided', restorable: true })
  })

  it('requires a bounded restore reason and marks the result terminal', () => {
    expect(restoreCostEntryBodySchema.safeParse({ reason: '  ' }).success).toBe(
      false
    )
    expect(
      restoreCostEntryCommandSchema.safeParse({
        projectId: UUID,
        costEntryId: UUID,
        reason: 'Corrected the source entry',
        tenantId: UUID,
      }).success
    ).toBe(false)
    expect(
      costEntryRestoreResultSchema.parse({
        costEntryId: UUID,
        tenantId: UUID,
        projectId: UUID,
        costSource: 'manual',
        status: 'restored',
        restoredAt: '2026-08-07T00:00:00.000Z',
        restorable: false,
      })
    ).toMatchObject({ status: 'restored', restorable: false })
  })
})
