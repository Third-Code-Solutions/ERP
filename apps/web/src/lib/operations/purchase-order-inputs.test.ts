import { describe, expect, it } from 'vitest'
import {
  createGroupedPoFromBomInputSchema,
  createPoFromBomInputSchema,
  standalonePurchaseOrderInputSchema,
} from './purchase-order-inputs'

const tenantScopedIds = {
  bomId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  vendorId: '33333333-3333-4333-8333-333333333333',
  costCodeId: '44444444-4444-4444-8444-444444444444',
}

describe('purchase-order input boundaries', () => {
  it('accepts validated BOM generation input', () => {
    expect(
      createPoFromBomInputSchema.safeParse({
        ...tenantScopedIds,
        deliveryDate: '2026-08-12',
      }).success
    ).toBe(true)
  })

  it('rejects malformed dates and non-UUID identifiers', () => {
    expect(
      createPoFromBomInputSchema.safeParse({
        ...tenantScopedIds,
        projectId: 'not-a-uuid',
        deliveryDate: '2026-02-30',
      }).success
    ).toBe(false)
  })

  it('rejects unsafe or structurally invalid standalone lines', () => {
    expect(
      standalonePurchaseOrderInputSchema.safeParse({
        projectId: tenantScopedIds.projectId,
        vendorId: null,
        deliveryDate: null,
        lineItems: [
          {
            description: 'Cable tray',
            quantity: 1.5,
            unit_cost_cents: 100,
            costCodeId: tenantScopedIds.costCodeId,
          },
        ],
      }).success
    ).toBe(false)
  })

  it('validates grouped BOM identifiers before any database access', () => {
    expect(
      createGroupedPoFromBomInputSchema.safeParse({
        bomId: tenantScopedIds.bomId,
      }).success
    ).toBe(true)
  })
})
