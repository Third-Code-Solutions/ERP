import { describe, it, expect } from 'vitest'
import {
  lineTotal,
  manualLineTotal,
  bomTotalCost,
  topLevelBomLines,
  purchasableBomLines,
  purchaseLineCostCode,
  rateCardPicker,
  computeTCV,
  computeGP,
  computeGPMargin,
  weightedTCV,
  computeVAT,
  computeEWT,
  computeRetention,
  progressBillingAmount,
} from '../calculations'

describe('lineTotal', () => {
  it('calculates line total with zero markup', () => {
    // 100 units @ ₱500 each, no markup
    expect(lineTotal(50000, 100, 0)).toBe(5000000)
  })

  it('applies markup in basis points', () => {
    // 10 units @ ₱10,000 each, 20% markup (2000 bps)
    // subtotal = 100,000; markup = 20,000; total = 120,000
    expect(lineTotal(1000000, 10, 2000)).toBe(12000000)
  })

  it('rounds fractional centavos', () => {
    // 1 unit @ ₱1, 3333 bps (33.33%)
    // subtotal = 100; markup = round(100*3333/10000) = round(33.33) = 33
    expect(lineTotal(100, 1, 3333)).toBe(133)
  })

  it('returns zero for zero unit cost', () => {
    expect(lineTotal(0, 100, 2000)).toBe(0)
  })

  it('returns zero for zero quantity', () => {
    expect(lineTotal(50000, 0, 2000)).toBe(0)
  })
})

describe('manualLineTotal', () => {
  it('never applies a line-level markup', () => {
    expect(manualLineTotal(12500, 4)).toBe(50000)
  })
})

describe('bomTotalCost', () => {
  it('sums all line totals', () => {
    const lines = [
      { line_total_cents: 1000000 },
      { line_total_cents: 500000 },
      { line_total_cents: 250000 },
    ]
    expect(bomTotalCost(lines)).toBe(1750000)
  })

  it('returns zero for empty BOM', () => {
    expect(bomTotalCost([])).toBe(0)
  })
})

describe('topLevelBomLines', () => {
  it('rolls up attached material cost through its parent exactly once', () => {
    const lines = [
      {
        id: 'parent',
        line_total_cents: 100000,
        unit_cost_cents: 100000,
        quantity: 1,
        parent_line_item_id: null,
      },
      {
        id: 'material-child',
        line_total_cents: 40000,
        unit_cost_cents: 40000,
        quantity: 1,
        parent_line_item_id: 'parent',
      },
    ]

    const topLevel = topLevelBomLines(lines, (line) => line.parent_line_item_id)
    const totalCostCents = topLevel.reduce(
      (total, line) => total + line.unit_cost_cents * line.quantity,
      0,
    )
    const tcvCents = bomTotalCost(topLevel)

    expect(topLevel.map((line) => line.id)).toEqual(['parent'])
    expect(totalCostCents).toBe(100000)
    expect(tcvCents).toBe(100000)
    expect(computeGP(tcvCents, totalCostCents)).toBe(0)
    expect(computeGPMargin(0, tcvCents)).toBe(0)
  })
})

// D-4: a Purchase Order buys BOM leaves only, so nothing is bought twice.
describe('purchasableBomLines', () => {
  const row = (
    id: string,
    values: Partial<{ is_group: number; parent_id: string; parent_line_item_id: string }> = {},
  ) => ({ id, is_group: 0, parent_id: null, parent_line_item_id: null, ...values })

  it('keeps leaves and drops group headers, sections and work items with materials', () => {
    const lines = [
      row('division', { is_group: 1 }),
      row('section', { parent_id: 'division' }),
      row('work', { parent_id: 'section' }),
      row('material-a', { parent_line_item_id: 'work' }),
      row('material-b', { parent_line_item_id: 'work' }),
      row('childless-work', { parent_id: 'section' }),
      row('empty-header', { is_group: 1 }),
      row('flat'),
    ]

    expect(purchasableBomLines(lines).map((line) => line.id)).toEqual([
      'material-a',
      'material-b',
      'childless-work',
      'flat',
    ])
  })

  it('buys an orphan row whose parent is missing as a leaf', () => {
    const lines = [row('orphan', { parent_id: 'missing' }), row('flat')]

    expect(purchasableBomLines(lines).map((line) => line.id)).toEqual(['orphan', 'flat'])
  })

  it('carries the work item cost code to its material lines', () => {
    const codes = new Map([['work', 'code-work'], ['own', 'code-own']])

    expect(purchaseLineCostCode(codes, { id: 'm', parent_line_item_id: 'work' })).toBe('code-work')
    expect(purchaseLineCostCode(codes, { id: 'own', parent_line_item_id: 'work' })).toBe('code-own')
    expect(purchaseLineCostCode(codes, { id: 'flat', parent_line_item_id: null })).toBeUndefined()
  })
})

describe('rateCardPicker', () => {
  const now = new Date('2026-11-04T00:00:00.000Z')
  const card = (
    id: string,
    values: Partial<{
      code: string | null
      unit: string | null
      vendorId: string | null
      unitPriceCents: number
      effectiveFrom: Date
      effectiveTo: Date | null
    }> = {},
  ) => ({
    id,
    code: 'CEM-40',
    unit: 'bag',
    vendorId: 'vendor-a',
    unitPriceCents: 24_550,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    ...values,
  })
  const vendors = new Set(['vendor-a', 'vendor-b'])
  const cement = { code: 'CEM-40', unit: 'bag' }

  it('picks the cheapest card and breaks price ties by the lowest id', () => {
    const pick = rateCardPicker(
      [card('c3', { unitPriceCents: 25_000 }), card('c2'), card('c1', { vendorId: 'vendor-b' })],
      vendors,
      now,
    )

    expect(pick(cement)?.id).toBe('c1')
  })

  it('ignores zero and negative prices, so a 0 card never wins the cheapest pick', () => {
    const pick = rateCardPicker(
      [card('zero', { unitPriceCents: 0 }), card('negative', { unitPriceCents: -1 }), card('valid')],
      vendors,
      now,
    )

    expect(pick(cement)?.id).toBe('valid')
    expect(rateCardPicker([card('zero', { unitPriceCents: 0 })], vendors, now)(cement)).toBeUndefined()
  })

  it('ignores expired and not-yet-effective cards', () => {
    const pick = rateCardPicker(
      [
        card('expired', { unitPriceCents: 1, effectiveTo: new Date('2026-11-03T23:59:59.000Z') }),
        card('ends-now', { unitPriceCents: 2, effectiveTo: now }),
        card('future', { unitPriceCents: 3, effectiveFrom: new Date('2026-11-05T00:00:00.000Z') }),
        card('current', { effectiveTo: new Date('2026-12-31T00:00:00.000Z') }),
      ],
      vendors,
      now,
    )

    expect(pick(cement)?.id).toBe('current')
  })

  it('ignores a card whose unit does not match the BOM line unit', () => {
    const pick = rateCardPicker(
      [card('kg', { unit: 'kg', unitPriceCents: 1 }), card('bag', { unit: '  BAG ' })],
      vendors,
      now,
    )

    expect(pick(cement)?.id).toBe('bag')
    expect(pick({ code: 'CEM-40', unit: 'sqm' })).toBeUndefined()
    expect(pick({ code: 'CEM-40', unit: null })).toBeUndefined()
  })

  it('ignores cards of unknown vendors but keeps vendorless cards', () => {
    const pick = rateCardPicker(
      [card('other-tenant', { vendorId: 'vendor-x', unitPriceCents: 1 }), card('vendorless', { vendorId: null })],
      vendors,
      now,
    )

    expect(pick(cement)?.id).toBe('vendorless')
    expect(pick({ code: 'NO-CARD', unit: 'bag' })).toBeUndefined()
    expect(pick({ code: null, unit: 'bag' })).toBeUndefined()
  })
})

describe('computeTCV', () => {
  it('computes TCV at 20% GP margin', () => {
    // cost ₱800K, margin 20% → TCV = 800K / 0.8 = ₱1M
    expect(computeTCV(80000000, 2000)).toBe(100000000)
  })

  it('computes TCV at 30% GP margin', () => {
    // cost ₱700K → TCV = 700K / 0.7 = ₱1M
    expect(computeTCV(70000000, 3000)).toBe(100000000)
  })

  it('returns zero when cost is zero', () => {
    expect(computeTCV(0, 2000)).toBe(0)
  })

  it('throws when marginBps is 10000 (100%)', () => {
    expect(() => computeTCV(100000, 10000)).toThrow()
  })

  it('throws when marginBps is negative', () => {
    expect(() => computeTCV(100000, -1)).toThrow()
  })
})

describe('computeGP', () => {
  it('subtracts cost from TCV', () => {
    expect(computeGP(100000000, 80000000)).toBe(20000000)
  })

  it('returns zero when TCV equals cost', () => {
    expect(computeGP(50000000, 50000000)).toBe(0)
  })
})

describe('computeGPMargin', () => {
  it('returns GP margin in basis points', () => {
    // GP ₱200K / TCV ₱1M = 20% = 2000 bps
    expect(computeGPMargin(20000000, 100000000)).toBe(2000)
  })

  it('returns zero when TCV is zero', () => {
    expect(computeGPMargin(0, 0)).toBe(0)
  })

  it('handles fractional margins', () => {
    // GP ₱1, TCV ₱3 → 33.33% = 3333 bps
    expect(computeGPMargin(1, 3)).toBe(3333)
  })
})

describe('weightedTCV', () => {
  it('applies probability to TCV', () => {
    // ₱1M TCV @ 75% probability → ₱750K
    expect(weightedTCV(100000000, 75)).toBe(75000000)
  })

  it('returns zero for 0% probability', () => {
    expect(weightedTCV(100000000, 0)).toBe(0)
  })

  it('returns full TCV for 100% probability', () => {
    expect(weightedTCV(100000000, 100)).toBe(100000000)
  })

  it('rounds fractional result', () => {
    // ₱100 @ 33% → 33 (rounded from 33.0)
    expect(weightedTCV(100, 33)).toBe(33)
  })
})

describe('computeVAT', () => {
  it('computes 12% VAT', () => {
    expect(computeVAT(100000000)).toBe(12000000)
  })

  it('rounds fractional VAT', () => {
    // 12% of 1 = 0.12 → 0
    expect(computeVAT(1)).toBe(0)
    // 12% of 10 = 1.2 → 1
    expect(computeVAT(10)).toBe(1)
  })

  it('keeps VAT exact near the safe-integer boundary', () => {
    const amount = Number.MAX_SAFE_INTEGER
    const expected = Number(
      (BigInt(amount) * 1200n + 5000n) / 10000n
    )
    expect(computeVAT(amount)).toBe(expected)
  })
})

describe('computeEWT', () => {
  it('computes 2% EWT', () => {
    expect(computeEWT(100000000)).toBe(2000000)
  })

  it('rounds fractional EWT', () => {
    expect(computeEWT(5)).toBe(0)
    expect(computeEWT(50)).toBe(1)
  })
})

describe('computeRetention', () => {
  it('computes 10% retention by default', () => {
    expect(computeRetention(100000000)).toBe(10000000)
  })

  it('applies custom retention basis points', () => {
    // 5% retention = 500 bps
    expect(computeRetention(100000000, 500)).toBe(5000000)
  })

  it('rounds fractional retention', () => {
    // 10% of 7 = 0.7 → 1
    expect(computeRetention(7)).toBe(1)
  })
})

describe('progressBillingAmount', () => {
  it('computes progress billing for 30%', () => {
    // 30% of ₱1M contract = ₱300K
    // 30% in bps = 3000
    expect(progressBillingAmount(100000000, 3000)).toBe(30000000)
  })

  it('computes full contract at 100%', () => {
    expect(progressBillingAmount(100000000, 10000)).toBe(100000000)
  })

  it('rounds fractional amounts', () => {
    expect(progressBillingAmount(3, 3333)).toBe(1)
  })

  it('does not lose a cent when multiplying a large centavo amount', () => {
    const contractCents = Number.MAX_SAFE_INTEGER
    const expected = Number(
      (BigInt(contractCents) * 9999n + 5000n) / 10000n
    )
    expect(progressBillingAmount(contractCents, 9999)).toBe(expected)
  })
})

describe('end-to-end BOM scenario', () => {
  it('computes a full MEP project estimate', () => {
    // Scenario: FCU supply + installation
    // 10 FCU units @ ₱45,000 each, 20% markup, 25% GP margin target
    const unitCostCents = 4500000 // ₱45,000 in centavos
    const quantity = 10
    const markupBps = 2000 // 20%

    const lt = lineTotal(unitCostCents, quantity, markupBps)
    expect(lt).toBe(54000000) // ₱540,000 total

    const tcv = computeTCV(lt, 2500) // 25% GP margin
    const gp = computeGP(tcv, lt)
    const gpMarginBps = computeGPMargin(gp, tcv)

    expect(gpMarginBps).toBe(2500) // Should round-trip to 25%

    const vat = computeVAT(tcv)
    const retention = computeRetention(tcv) // default 10%

    // Sanity checks
    expect(vat).toBeGreaterThan(0)
    expect(retention).toBeGreaterThan(0)
    expect(gp).toBeGreaterThan(0)
    expect(tcv).toBeGreaterThan(lt)
  })
})
