import { describe, expect, it } from 'vitest'

import {
  assertBoqUnitRate,
  computeDupa,
  dupaUpsertInputSchema,
  deriveBoqLineAmount,
} from '../dupa'

describe('DUPA engine', () => {
  it('exposes the published MNHPI fixture discrepancy with exact listed inputs', () => {
    const result = computeDupa({
      headerQuantity: '0.10',
      materials: [{ quantity: '1.00', unitRateCentavos: 595_100n }],
      labour: [
        { noOfPersons: '1.00', hourlyRateCentavos: 27_202n, productivityPerHour: '1.00' },
        { noOfPersons: '1.00', hourlyRateCentavos: 19_909n, productivityPerHour: '1.00' },
        { noOfPersons: '2.00', hourlyRateCentavos: 17_379n, productivityPerHour: '1.00' },
      ],
      equipment: [
        { noOfUnits: '1.00', hourlyRateCentavos: 60_000n, productivityPerHour: '0.10' },
      ],
    })

    // The PRD mandates 1_621_750 / 16_217_500, but the listed centavo rates
    // produce 1_621_751 / 16_217_506 under the required exact arithmetic.
    // Keep this assertion until ABI supplies the source-precision rates.
    expect(result.totalCostCentavos).toBe(1_621_751n)
    expect(result.unitRateCentavos).toBe(16_217_506n)
    expect(result.vatBase).toBe('direct_only')
  })

  it('rejects using G as the BOQ unit cost instead of H', () => {
    const result = computeDupa({
      headerQuantity: '0.10',
      materials: [{ quantity: '1.00', unitRateCentavos: 595_100n }],
      labour: [{ noOfPersons: '1.00', hourlyRateCentavos: 27_202n, productivityPerHour: '1.00' }],
      equipment: [{ noOfUnits: '1.00', hourlyRateCentavos: 60_000n, productivityPerHour: '0.10' }],
    })

    expect(() => assertBoqUnitRate(result, result.totalCostCentavos)).toThrow(
      'BOQ unit rate must equal the persisted DUPA H unit rate',
    )
    expect(() => assertBoqUnitRate(result, result.unitRateCentavos)).not.toThrow()
  })

  it('derives BOQ amount from persisted H with centavo rounding', () => {
    expect(deriveBoqLineAmount(16_217_500n, '0.10')).toBe(1_621_750n)
  })

  it('supports the configurable direct-plus-indirect VAT base', () => {
    const directOnly = computeDupa({
      headerQuantity: '1',
      materials: [{ quantity: '1', unitRateCentavos: 100n }],
      vatBase: 'direct_only',
    })
    const directPlusIndirect = computeDupa({
      headerQuantity: '1',
      materials: [{ quantity: '1', unitRateCentavos: 100n }],
      vatBase: 'direct_plus_indirect',
    })

    expect(directPlusIndirect.vatCentavos).toBeGreaterThan(directOnly.vatCentavos)
  })

  it('rejects zero productivity and non-positive header quantities', () => {
    expect(() =>
      computeDupa({
        headerQuantity: '1',
        labour: [{ noOfPersons: '1', hourlyRateCentavos: 1n, productivityPerHour: '0' }],
      }),
    ).toThrow('productivity per hour must be greater than zero')
    expect(() => computeDupa({ headerQuantity: '0' })).toThrow(
      'header quantity must be greater than zero',
    )
  })

  it('validates persisted DUPA input and rejects unknown keys', () => {
    const parsed = dupaUpsertInputSchema.safeParse({
      lineItemId: '11111111-1111-4111-8111-111111111111',
      headerQuantity: '0.10',
      uom: 'cu.m',
      materials: [
        {
          description: 'Concrete',
          quantity: '1.00',
          uom: 'cu.m',
          unitRateCentavos: '595100',
          rateSource: 'manual',
          rateAsOf: null,
        },
      ],
      labour: [],
      equipment: [],
    })
    expect(parsed.success).toBe(true)

    expect(
      dupaUpsertInputSchema.safeParse({
        lineItemId: '11111111-1111-4111-8111-111111111111',
        headerQuantity: '0.10',
        uom: 'cu.m',
        unexpected: true,
      }).success,
    ).toBe(false)
  })
})
