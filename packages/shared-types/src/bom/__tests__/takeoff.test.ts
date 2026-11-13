import { describe, expect, it } from 'vitest'

import {
  TAKEOFF_MAX_LINE_TOTAL_CENTAVOS,
  takeoffCommitPricing,
  takeoffCommitQuantity,
  validateTakeoffRows,
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

// boq-export A.8: the units the app's forms offer and the export writes re-import.
describe('takeoff units', () => {
  const withUnit = (unit: string) => ({ ...row(1), unit })
  const NEW_UNITS = ['m', 'ls', 'l.s.', 'ea', 'each', 'no.', 'no', 'nos', 'unit', 'units', 'bag', 'bags', 'box']
  // The other ways a lump sum is written; the Web parser reads each as one (boq-excel A.5).
  const LUMP_SUM_SPELLINGS = ['l.s', 'lump sum', 'lumpsum']

  it('accepts each added unit, in any case and spacing', () => {
    for (const unit of [...NEW_UNITS, ...LUMP_SUM_SPELLINGS]) {
      expect(validateTakeoffRows([withUnit(unit)]), unit).toEqual([])
      expect(validateTakeoffRows([withUnit(` ${unit.toUpperCase()} `)]), unit).toEqual([])
    }
    expect(validateTakeoffRows([withUnit('Lump  Sum')])).toEqual([])
  })

  it('still queues a unit that is not on the list', () => {
    for (const unit of ['', 'bundle', 'l/s', 'lump-sum', 'm 2', 'mm']) {
      expect(validateTakeoffRows([withUnit(unit)]), unit).toEqual([
        { sourceRowKey: 'concrete-1', code: 'INVALID_UOM', message: `UOM "${unit}" is not recognized.` },
      ])
    }
  })
})

// boq-export A.4: a client BOQ rate travels as integer centavos per row.
describe('takeoff unit rate', () => {
  const priced = (unitRateCentavos: number | null | undefined, quantity: number | null = 2.5) => ({
    ...row(quantity),
    unitRateCentavos,
  })

  it('prices a row with a rate as client_boq, half-up to the centavo', () => {
    expect(validateTakeoffRows([priced(12_345)])).toEqual([])
    // 2.5 x 123.45 = 308.625 -> 308.63
    expect(takeoffCommitPricing(priced(12_345))).toEqual({
      unitCostCents: 12_345,
      lineTotalCents: 30_863,
      unitRateSource: 'client_boq',
    })
  })

  it('keeps the unpriced manual behaviour without a rate', () => {
    expect(takeoffCommitPricing(priced(undefined))).toEqual({
      unitCostCents: 0,
      lineTotalCents: 0,
      unitRateSource: 'manual',
    })
  })

  it('queues an unreadable rate and commits it unpriced', () => {
    expect(validateTakeoffRows([priced(null)])).toContainEqual({
      sourceRowKey: 'concrete-1',
      code: 'INVALID_UNIT_RATE',
      message: 'Unit rate could not be read as a non-negative peso amount.',
    })
    expect(takeoffCommitPricing(priced(null)).unitRateSource).toBe('manual')
  })

  it('caps one imported line at PHP 10 billion so BOM totals stay exact', () => {
    // 1,000,000,000.00 x 10 = exactly the cap: still priced.
    expect(takeoffCommitPricing(priced(100_000_000_000, 10)).lineTotalCents).toBe(
      TAKEOFF_MAX_LINE_TOTAL_CENTAVOS,
    )
    expect(validateTakeoffRows([priced(100_000_000_000, 10)])).toEqual([])
    // One centavo over the cap queues the row and commits it unpriced.
    const over = priced(100_000_000_000, 10.0001)
    expect(validateTakeoffRows([over])).toContainEqual(
      expect.objectContaining({ code: 'INVALID_UNIT_RATE' }),
    )
    expect(takeoffCommitPricing(over).unitRateSource).toBe('manual')
    expect(5_000 * TAKEOFF_MAX_LINE_TOTAL_CENTAVOS).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })

  it('queues a rate whose amount leaves the exact centavo range', () => {
    const huge = priced(1_000_000_000_000, 2_000_000_000)
    expect(validateTakeoffRows([huge])).toContainEqual(
      expect.objectContaining({ code: 'INVALID_UNIT_RATE' }),
    )
    expect(takeoffCommitPricing(huge)).toEqual({
      unitCostCents: 0,
      lineTotalCents: 0,
      unitRateSource: 'manual',
    })
  })
})
