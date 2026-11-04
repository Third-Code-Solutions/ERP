import { describe, expect, it } from 'vitest'

import { takeoffCommitQuantity, validateTakeoffRows } from '../takeoff'

const row = (quantity: number | null) => ({
  sourceRowKey: 'concrete-1',
  description: 'Stair footing concrete inc. forms',
  quantity,
  unit: 'cu.m',
  division: 'concrete',
  location: null,
  itemNo: 'C-001',
  notes: null,
  raw: { quantity },
})

// D-5: BOQ quantity is numeric(18,4). Fractional takeoff quantities up to 4
// decimal places commit exactly; finer values queue instead of rounding.
describe('takeoff validation', () => {
  it('accepts quantities with up to 4 decimal places', () => {
    expect(validateTakeoffRows([row(0.1)])).toEqual([])
    expect(validateTakeoffRows([row(12.5)])).toEqual([])
    expect(validateTakeoffRows([row(0.0001)])).toEqual([])
    expect(takeoffCommitQuantity(0.1)).toBe('0.1')
    expect(takeoffCommitQuantity(12.5)).toBe('12.5')
    expect(takeoffCommitQuantity(12)).toBe('12')
  })

  it('queues quantities finer than 4 decimal places instead of rounding them', () => {
    expect(validateTakeoffRows([row(0.00001)])).toContainEqual({
      sourceRowKey: 'concrete-1',
      code: 'INVALID_QUANTITY',
      message: 'Quantity must have at most 4 decimal places and not exceed 2,147,483,647.',
    })
    expect(takeoffCommitQuantity(0.00001)).toBe('0')
    expect(takeoffCommitQuantity(12.34567)).toBe('0')
  })

  it('queues missing, zero, negative and out-of-range quantities', () => {
    for (const quantity of [null, 0, -1]) {
      expect(validateTakeoffRows([row(quantity)])).toContainEqual({
        sourceRowKey: 'concrete-1',
        code: 'INVALID_QUANTITY',
        message: 'Quantity must be greater than zero.',
      })
      expect(takeoffCommitQuantity(quantity)).toBe('0')
    }
    expect(validateTakeoffRows([row(2_147_483_648)])[0]?.code).toBe('INVALID_QUANTITY')
    expect(takeoffCommitQuantity(2_147_483_648)).toBe('0')
  })
})
