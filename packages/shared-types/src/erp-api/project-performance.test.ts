import { describe, expect, it } from 'vitest'
import {
  computeProjectPerformance,
  projectPerformanceResultSchema,
} from './project-performance'

const BASE = {
  projectId: '33333333-3333-4333-8333-333333333333',
  asOf: '2026-09-10T00:00:00.000Z',
  currency: 'PHP',
  latestProgressWeekEnding: '2026-09-06T00:00:00.000Z',
  progressSource: 'weekly_progress' as const,
  plannedValueSource: 'normalized_schedule_labor' as const,
  actualCostEvidenceCount: 4,
}

describe('project performance contracts and math', () => {
  it('computes PV, EV, CPI, SPI, EAC, and VAC without adding commitments to actuals', () => {
    const result = computeProjectPerformance({
      ...BASE,
      baselineCents: 1_000_000,
      plannedPercentComplete: 50,
      actualPercentComplete: 40,
      actualCostCents: 350_000,
    })

    expect(result.status).toBe('ready')
    expect(result.plannedValueCents).toBe(500_000)
    expect(result.earnedValueCents).toBe(400_000)
    expect(result.costVarianceCents).toBe(50_000)
    expect(result.scheduleVarianceCents).toBe(-100_000)
    expect(result.costPerformanceIndexBps).toBe(11_429)
    expect(result.schedulePerformanceIndexBps).toBe(8_000)
    expect(result.estimateAtCompletionCents).toBe(875_000)
    expect(result.varianceAtCompletionCents).toBe(125_000)
    expect(projectPerformanceResultSchema.parse(result)).toEqual(result)
  })

  it('stays explicit when an approved baseline or progress evidence is missing', () => {
    const result = computeProjectPerformance({
      ...BASE,
      baselineCents: null,
      plannedPercentComplete: null,
      actualPercentComplete: null,
      latestProgressWeekEnding: null,
      progressSource: 'unavailable',
      plannedValueSource: 'unavailable',
      actualCostEvidenceCount: 0,
      actualCostCents: 0,
    })

    expect(result.status).toBe('unavailable')
    expect(result.missingEvidence).toEqual([
      'approved_budget',
      'planned_schedule',
      'actual_progress',
      'posted_supplier_bill_actuals',
    ])
    expect(result.plannedValueCents).toBeNull()
    expect(result.earnedValueCents).toBeNull()
    expect(result.estimateAtCompletionCents).toBeNull()
  })
})
