import { describe, expect, it } from 'vitest'
import {
  allocateProRata,
  availableInventory,
  calculateTax,
  closeStatus,
  convertMinorUnits,
  createProcurementRequisitionCommandSchema,
  providerDeliveryRequestSchema,
  resolvePriceCandidate,
  retryDelayMs,
  tenantCurrencyCommandSchema,
} from './roadmap'

describe('roadmap contracts and exact calculations', () => {
  it('keeps procurement input server-owned and validates positive micro quantities', () => {
    const parsed = createProcurementRequisitionCommandSchema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      purpose: 'Concrete pour for level 2 slab',
      neededBy: '2026-10-01',
      currency: 'PHP',
      lines: [
        {
          description: 'Ready-mix concrete',
          quantityMicros: '1000000',
          estimatedUnitCostCents: '125000',
        },
      ],
    })
    expect(parsed.lines).toHaveLength(1)
    expect(() => createProcurementRequisitionCommandSchema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      purpose: 'invalid quantity',
      currency: 'PHP',
      lines: [{ description: 'x', quantityMicros: '0', estimatedUnitCostCents: '1' }],
    })).toThrow()
  })

  it('allocates landed cost exactly with deterministic remainder assignment', () => {
    const allocation = allocateProRata(10n, [3n, 3n, 4n])
    expect(allocation).toEqual([3n, 3n, 4n])
    expect(allocateProRata(1n, [1n, 1n])).toEqual([1n, 0n])
    expect(allocation.reduce((sum, value) => sum + value, 0n)).toBe(10n)
  })

  it('prevents reservations from exceeding available stock', () => {
    expect(availableInventory(100n, 40n)).toBe(60n)
    expect(() => availableInventory(40n, 50n)).toThrow('Inventory balance cannot be negative')
  })

  it('converts currencies and calculates configurable PH defaults with integer rounding', () => {
    expect(convertMinorUnits(10_000n, 56n, 100n)).toBe(5_600n)
    expect(calculateTax(100_000n, {
      vatRateBps: 1_200,
      withholdingRateBps: 200,
      retentionRateBps: 0,
      vatRegistered: true,
    })).toEqual({
      baseCents: '100000',
      vatCents: '12000',
      withholdingTaxCents: '2000',
      retentionCents: '0',
      netCents: '110000',
    })
  })

  it('resolves the deepest quantity tier, then price, then stable id', () => {
    const result = resolvePriceCandidate([
      {
        priceListId: 'pl', priceListItemId: 'b', vendorId: null, unitPriceCents: 95n,
        minimumQuantityMicros: 1n, validFrom: '2026-01-01', validTo: null, status: 'active',
      },
      {
        priceListId: 'pl', priceListItemId: 'a', vendorId: null, unitPriceCents: 100n,
        minimumQuantityMicros: 5n, validFrom: '2026-01-01', validTo: null, status: 'active',
      },
      {
        priceListId: 'pl', priceListItemId: 'c', vendorId: null, unitPriceCents: 90n,
        minimumQuantityMicros: 5n, validFrom: '2026-01-01', validTo: null, status: 'active',
      },
    ], 5n, '2026-05-01')
    expect(result.priceListItemId).toBe('c')
  })

  it('fails closed for close checks, providers and retries', () => {
    expect(closeStatus([{ key: 'unmatched_receipts', passed: false, detail: '1 open' }])).toBe('blocked')
    expect(closeStatus([{ key: 'unmatched_receipts', passed: true, detail: 'none' }])).toBe('ready')
    expect(providerDeliveryRequestSchema.safeParse({
      channel: 'sms', provider: 'semaphore', eventType: 'po.issued', aggregateType: 'purchase_order',
      aggregateId: '11111111-1111-4111-8111-111111111111', recipient: '+639171234567', body: 'PO issued', templateVersion: '1',
    }).success).toBe(true)
    expect(providerDeliveryRequestSchema.safeParse({
      channel: 'sms', provider: 'semaphore', eventType: 'po.issued', aggregateType: 'purchase_order',
      aggregateId: '11111111-1111-4111-8111-111111111111', recipient: '09171234567', body: 'PO issued', templateVersion: '1',
    }).success).toBe(false)
    expect(retryDelayMs(1)).toBe(1_000)
    expect(retryDelayMs(10)).toBe(300_000)
  })

  it('requires a live base currency configuration', () => {
    expect(tenantCurrencyCommandSchema.safeParse({
      currencyCode: 'PHP', decimalPlaces: 2, isBase: true, isActive: true,
    }).success).toBe(true)
    expect(tenantCurrencyCommandSchema.safeParse({
      currencyCode: 'PHP', decimalPlaces: 2, isBase: true, isActive: false,
    }).success).toBe(false)
  })
})
