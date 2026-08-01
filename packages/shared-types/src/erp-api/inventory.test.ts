import { describe, expect, it } from 'vitest'
import {
  createStockReceiptCommandSchema,
  quantityToMicros,
  receiptLineTotal,
} from './inventory'

const UUID = '11111111-1111-4111-8111-111111111111'

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
})
