import { describe, expect, it } from 'vitest'

import {
  takeoffCommitQuantity,
  takeoffIssueStillApplies,
  validateTakeoffRows,
  type TakeoffLineState,
} from '../takeoff'

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

describe('takeoffIssueStillApplies', () => {
  const line: TakeoffLineState = {
    description: 'Stair footing concrete',
    quantity: '12.5000',
    unit: 'cu.m',
    hasDivision: true,
    parentLineItemId: null,
    unitRateSource: 'manual',
  }

  it('clears every reason once the line is complete', () => {
    for (const code of [
      'EMPTY_DESCRIPTION',
      'INVALID_QUANTITY',
      'INVALID_UOM',
      'MISSING_DIVISION',
      'MATERIAL_PARENT_REQUIRED',
      'DUPLICATE_SOURCE_ROW_KEY',
    ]) {
      expect(takeoffIssueStillApplies(code, line)).toBe(false)
    }
  })

  it('keeps the placeholder description and a zero quantity open', () => {
    expect(
      takeoffIssueStillApplies('EMPTY_DESCRIPTION', {
        ...line,
        description: 'Unresolved takeoff row row-4',
      }),
    ).toBe(true)
    expect(takeoffIssueStillApplies('INVALID_QUANTITY', { ...line, quantity: '0.0000' })).toBe(true)
  })

  it('keeps an unrecognised unit and a missing division open', () => {
    expect(takeoffIssueStillApplies('INVALID_UOM', { ...line, unit: 'bundle' })).toBe(true)
    expect(takeoffIssueStillApplies('INVALID_UOM', { ...line, unit: null })).toBe(true)
    expect(takeoffIssueStillApplies('MISSING_DIVISION', { ...line, hasDivision: false })).toBe(true)
  })

  it('needs a parent for a material unit and a DUPA for an unpriced candidate', () => {
    expect(takeoffIssueStillApplies('MATERIAL_PARENT_REQUIRED', { ...line, unit: 'pc' })).toBe(true)
    expect(
      takeoffIssueStillApplies('MATERIAL_PARENT_REQUIRED', {
        ...line,
        unit: 'pc',
        parentLineItemId: '11111111-1111-4111-8111-111111111111',
      }),
    ).toBe(false)
    expect(takeoffIssueStillApplies('NO_CATALOG_MATCH', line)).toBe(true)
    expect(takeoffIssueStillApplies('NO_CATALOG_MATCH', { ...line, unitRateSource: 'dupa' })).toBe(false)
  })
})
