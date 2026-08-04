import { describe, expect, it } from 'vitest'
import {
  configureInventoryItemCommandSchema,
  createInventoryUomCommandSchema,
  createStockReceiptCommandSchema,
  inventoryUomCreationResultSchema,
  inventoryItemConfigurationResultSchema,
  inventorySummaryResultSchema,
  quantityToMicros,
  receiptLineTotal,
  stockReceiptPostCommandSchema,
  stockReceiptPostingResultSchema,
  stockReceiptReverseCommandSchema,
  stockReceiptReversalResultSchema,
} from './inventory'

const UUID = '11111111-1111-4111-8111-111111111111'

const INVENTORY_SUMMARY = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  uoms: [
    {
      id: UUID,
      code: 'EA',
      name: 'Each',
      decimalPlaces: 0,
      isActive: true,
    },
  ],
  warehouses: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      code: 'MAIN',
      name: 'Main store',
      projectId: null,
      isActive: true,
    },
  ],
  items: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      code: 'CEMENT',
      description: 'Cement',
      baseUomId: UUID,
      inventoryTracked: true,
      isActive: true,
    },
  ],
  projects: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Site A' }],
  balances: [
    {
      warehouseId: '33333333-3333-4333-8333-333333333333',
      warehouseCode: 'MAIN',
      warehouseName: 'Main store',
      itemId: '44444444-4444-4444-8444-444444444444',
      itemCode: 'CEMENT',
      itemDescription: 'Cement',
      uomCode: 'EA',
      quantityMicros: '4250000',
      valueCents: '10001',
    },
  ],
  balancesTruncated: false,
  receiptCounts: { draftCount: 1, postedCount: 2 },
} as const

const ITEM_CONFIGURATION = {
  materialItemId: '44444444-4444-4444-8444-444444444444',
  tenantId: '22222222-2222-4222-8222-222222222222',
  baseUomId: UUID,
  inventoryTracked: true,
  unit: 'EA',
  updatedAt: '2026-08-05T00:00:00.000Z',
} as const

const UOM_CREATION = {
  uomId: '66666666-6666-4666-8666-666666666666',
  tenantId: '22222222-2222-4222-8222-222222222222',
  code: 'EA',
  name: 'Each',
  decimalPlaces: 0,
  isActive: true,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
} as const

describe('Inventory UOM creation contract', () => {
  it('accepts strict setup data and rejects browser identity fields', () => {
    expect(
      createInventoryUomCommandSchema.parse({
        code: ' EA ',
        name: ' Each ',
        decimalPlaces: 0,
      })
    ).toEqual({ code: 'EA', name: 'Each', decimalPlaces: 0 })
    expect(inventoryUomCreationResultSchema.parse(UOM_CREATION)).toEqual(
      UOM_CREATION
    )
    expect(() =>
      createInventoryUomCommandSchema.parse({
        code: 'EA',
        name: 'Each',
        decimalPlaces: 0,
        tenantId: UOM_CREATION.tenantId,
      })
    ).toThrow()
  })
})

describe('Inventory item configuration contract', () => {
  it('accepts a strict state-setting command and result', () => {
    expect(
      configureInventoryItemCommandSchema.parse({
        uomId: UUID,
        tracked: true,
      })
    ).toEqual({ uomId: UUID, tracked: true })
    expect(inventoryItemConfigurationResultSchema.parse(ITEM_CONFIGURATION)).toEqual(
      ITEM_CONFIGURATION
    )
    expect(() =>
      configureInventoryItemCommandSchema.parse({
        uomId: UUID,
        tracked: true,
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
    ).toThrow()
  })
})

describe('Inventory summary contract', () => {
  it('accepts bounded tenant-scoped data with exact integer strings', () => {
    expect(inventorySummaryResultSchema.parse(INVENTORY_SUMMARY)).toEqual(
      INVENTORY_SUMMARY
    )
  })

  it('rejects numeric money/quantity values and unknown fields', () => {
    expect(() =>
      inventorySummaryResultSchema.parse({
        ...INVENTORY_SUMMARY,
        balances: [
          { ...INVENTORY_SUMMARY.balances[0], valueCents: 10001 },
        ],
      })
    ).toThrow()
    expect(() =>
      inventorySummaryResultSchema.parse({
        ...INVENTORY_SUMMARY,
        unexpected: true,
      })
    ).toThrow()
  })
})

describe('Stock Receipt command contract', () => {
  it('accepts bounded decimal quantities and trims text', () => {
    const command = createStockReceiptCommandSchema.parse({
      warehouseId: UUID,
      purchaseOrderId: '22222222-2222-4222-8222-222222222222',
      supplierDeliveryReference: '  DR-7  ',
      receivedDate: '2026-08-01',
      notes: '  accepted  ',
      lines: [{ poLineItemId: '33333333-3333-4333-8333-333333333333', quantity: ' 4.25 ' }],
    })

    expect(command.supplierDeliveryReference).toBe('DR-7')
    expect(command.notes).toBe('accepted')
    expect(command.lines[0]?.quantity).toBe('4.25')
  })

  it('keeps duplicate line identity validation at the transaction boundary', () => {
    expect(() =>
      createStockReceiptCommandSchema.parse({
        warehouseId: UUID,
        purchaseOrderId: '22222222-2222-4222-8222-222222222222',
        receivedDate: '2026-08-01',
        lines: [
          { poLineItemId: '33333333-3333-4333-8333-333333333333', quantity: '1' },
          { poLineItemId: '33333333-3333-4333-8333-333333333333', quantity: '2' },
        ],
      })
    ).not.toThrow()
  })

  it('uses exact micro-unit conversion and centavo rounding', () => {
    expect(quantityToMicros('4.25')).toBe(4_250_000n)
    expect(quantityToMicros('0.000001')).toBe(1n)
    expect(receiptLineTotal(1_500_000n, 10_001n)).toBe(15_002n)
    expect(receiptLineTotal(500_000n, 1n)).toBe(1n)
  })

  it.each(['0', '-1', '1.0000001', '1.2.3'])('rejects invalid quantity %s', (value) => {
    expect(() => quantityToMicros(value)).toThrow()
  })

  it('rejects zero-valued receipt lines', () => {
    expect(() => receiptLineTotal(1n, 0n)).toThrow(
      'Receipt line value must be positive'
    )
  })

  it('rejects impossible receipt dates before database authority', () => {
    expect(() =>
      createStockReceiptCommandSchema.parse({
        warehouseId: UUID,
        purchaseOrderId: '22222222-2222-4222-8222-222222222222',
        receivedDate: '2026-02-30',
        lines: [
          {
            poLineItemId: '33333333-3333-4333-8333-333333333333',
            quantity: '1',
          },
        ],
      })
    ).toThrow('Date must be a real calendar date')
  })

  it('keeps post and reverse workflow contracts strict', () => {
    expect(
      stockReceiptPostCommandSchema.parse({ postingDate: '2026-08-02' })
    ).toEqual({ postingDate: '2026-08-02' })
    expect(
      stockReceiptReverseCommandSchema.parse({
        postingDate: '2026-08-02',
        reason: 'Supplier correction',
      })
    ).toEqual({
      postingDate: '2026-08-02',
      reason: 'Supplier correction',
    })
    expect(() =>
      stockReceiptReverseCommandSchema.parse({
        postingDate: '2026-08-02',
        reason: 'no',
      })
    ).toThrow()
  })

  it('validates posted and reversed result identities', () => {
    const resultBase = {
      stockReceiptId: '33333333-3333-4333-8333-333333333333',
      tenantId: '22222222-2222-4222-8222-222222222222',
    }
    expect(
      stockReceiptPostingResultSchema.parse({
        ...resultBase,
        status: 'posted',
        receiptNumber: 'SR-2026-000001',
        journalEntryId: '44444444-4444-4444-8444-444444444444',
        journalEntryNumber: 'JE-2026-000001',
      }).status
    ).toBe('posted')
    expect(
      stockReceiptReversalResultSchema.parse({
        ...resultBase,
        status: 'reversed',
        reversalJournalEntryId: '55555555-5555-4555-8555-555555555555',
        reversalJournalEntryNumber: 'JE-2026-000002',
      }).status
    ).toBe('reversed')
  })
})
