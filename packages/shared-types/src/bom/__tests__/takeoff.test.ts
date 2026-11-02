import { describe, expect, it } from 'vitest'

import { takeoffCommitQuantity, validateTakeoffRows } from '../takeoff'

describe('takeoff validation', () => {
  it('preserves supported fractional quantities instead of rounding them', () => {
    const issues = validateTakeoffRows([
      {
        sourceRowKey: 'concrete-1',
        description: 'Stair footing concrete inc. forms',
        quantity: 0.1,
        unit: 'cu.m',
        division: 'concrete',
        location: null,
        itemNo: 'C-001',
        notes: null,
        raw: { quantity: 0.1 },
      },
    ])

    expect(issues).toEqual([])
    expect(takeoffCommitQuantity(0.1)).toBe(0.1)
    expect(takeoffCommitQuantity(12.5)).toBe(12.5)
    expect(takeoffCommitQuantity(0.12345)).toBe(0)
    expect(takeoffCommitQuantity(12)).toBe(12)
  })
})
