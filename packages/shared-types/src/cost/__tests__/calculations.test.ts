import { describe, it, expect } from 'vitest'
import {
  computeProjectCostSnapshot,
  computeCategoryRollup,
  erosionSeverity,
  GP_EROSION_WARN_BPS,
  GP_EROSION_DANGER_BPS,
} from '../calculations'

describe('computeProjectCostSnapshot', () => {
  it('zero everything → all zeros, no division errors', () => {
    const s = computeProjectCostSnapshot({
      budgetCents: 0,
      committedCents: 0,
      actualCents: 0,
      bomTcvCents: 0,
      bomGpCents: 0,
    })
    expect(s.forecastCostCents).toBe(0)
    expect(s.gpErosionBps).toBe(0)
    expect(s.projectedGpMarginBps).toBe(0)
    expect(s.severity).toBe('none')
  })

  it('actual < committed < budget → under budget, no erosion', () => {
    // TCV 1,000,000 ; budget 800,000 ; committed 600,000 ; actual 400,000
    const s = computeProjectCostSnapshot({
      budgetCents: 800_000,
      committedCents: 600_000,
      actualCents: 400_000,
      bomTcvCents: 1_000_000,
      bomGpCents: 200_000, // 1,000,000 − 800,000
    })
    expect(s.forecastCostCents).toBe(600_000) // max(actual, committed)
    expect(s.budgetVarianceCents).toBe(400_000) // under budget
    expect(s.projectedGpCents).toBe(400_000) // TCV − forecast
    // projected GP (400k) > original GP (200k) → erosion negative (improved)
    expect(s.gpErosionCents).toBe(-200_000)
    expect(s.gpErosionBps).toBeLessThan(0)
    expect(s.severity).toBe('none')
  })

  it('forecast uses max(actual, committed) when actual exceeds committed', () => {
    const s = computeProjectCostSnapshot({
      budgetCents: 800_000,
      committedCents: 600_000,
      actualCents: 900_000, // unplanned overspend beyond committed
      bomTcvCents: 1_000_000,
      bomGpCents: 200_000,
    })
    expect(s.forecastCostCents).toBe(900_000)
    expect(s.budgetVarianceCents).toBe(-100_000) // over budget
  })

  it('cost overrun erodes GP and crosses the danger threshold', () => {
    // TCV 1,000,000, original GP 200,000. Actual 1,100,000 → projected GP -100,000.
    const s = computeProjectCostSnapshot({
      budgetCents: 800_000,
      committedCents: 1_000_000,
      actualCents: 1_100_000,
      bomTcvCents: 1_000_000,
      bomGpCents: 200_000,
    })
    expect(s.forecastCostCents).toBe(1_100_000)
    expect(s.projectedGpCents).toBe(-100_000) // can go negative
    expect(s.gpErosionCents).toBe(300_000) // 200k − (−100k)
    expect(s.gpErosionBps).toBe(3000) // 30% of TCV
    expect(s.severity).toBe('danger')
  })

  it('mild overrun lands in the warning band', () => {
    // erode exactly 10% of TCV → between warn (5%) and danger (15%)
    const s = computeProjectCostSnapshot({
      budgetCents: 800_000,
      committedCents: 900_000,
      actualCents: 900_000,
      bomTcvCents: 1_000_000,
      bomGpCents: 200_000,
    })
    // projected GP = 1,000,000 − 900,000 = 100,000 ; erosion = 100,000 = 10%
    expect(s.gpErosionBps).toBe(1000)
    expect(s.severity).toBe('warning')
  })

  it('bomTcvCents = 0 → bps guards to 0', () => {
    const s = computeProjectCostSnapshot({
      budgetCents: 100,
      committedCents: 100,
      actualCents: 100,
      bomTcvCents: 0,
      bomGpCents: 0,
    })
    expect(s.gpErosionBps).toBe(0)
    expect(s.originalGpMarginBps).toBe(0)
  })
})

describe('erosionSeverity thresholds', () => {
  it('classifies at the boundaries', () => {
    expect(erosionSeverity(0)).toBe('none')
    expect(erosionSeverity(GP_EROSION_WARN_BPS)).toBe('none') // 500 = boundary, not yet warning
    expect(erosionSeverity(GP_EROSION_WARN_BPS + 1)).toBe('warning')
    expect(erosionSeverity(GP_EROSION_DANGER_BPS)).toBe('warning')
    expect(erosionSeverity(GP_EROSION_DANGER_BPS + 1)).toBe('danger')
    expect(erosionSeverity(-100)).toBe('none')
  })
})

describe('computeCategoryRollup', () => {
  it('empty → all categories zero', () => {
    const r = computeCategoryRollup([])
    expect(r.material).toBe(0)
    expect(r.labour).toBe(0)
    expect(r.other).toBe(0)
  })

  it('sums by category', () => {
    const r = computeCategoryRollup([
      { cost_category: 'material', amount_cents: 100 },
      { cost_category: 'material', amount_cents: 250 },
      { cost_category: 'labour', amount_cents: 400 },
    ])
    expect(r.material).toBe(350)
    expect(r.labour).toBe(400)
    expect(r.subcontractor).toBe(0)
  })
})
