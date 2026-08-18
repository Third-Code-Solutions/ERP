import { describe, expect, it } from 'vitest'

import { takeoffCommitQuantity, validateTakeoffRows } from '../takeoff'

describe('takeoff validation', () => {
  it('queues fractional quantities instead of silently rounding them', () => {
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

    expect(issues).toContainEqual({
      sourceRowKey: 'concrete-1',
      code: 'INVALID_QUANTITY',
      message:
        'Fractional quantity requires decimal BOM precision before it can be committed.',
    })
    expect(takeoffCommitQuantity(0.1)).toBe(0)
    expect(takeoffCommitQuantity(12)).toBe(12)
  })
})
