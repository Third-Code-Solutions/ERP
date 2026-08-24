import { describe, expect, it } from 'vitest'

import {
  conversionRatesFromStageCounts,
  isCompatibleOpportunityTransition,
  isActiveSalesStage,
  normalizeStageAggregates,
} from './sales-dashboard-pipeline'

describe('Sales dashboard pipeline normalization', () => {
  it('groups legacy opportunity stages with their canonical ABI OPS stages', () => {
    const rows = normalizeStageAggregates([
      { stage: 'opportunity_creation', count: 2, tcvCents: 20_000, gpCents: 4_000 },
      { stage: 'lead', count: 3, tcvCents: 30_000, gpCents: 6_000 },
      { stage: 'scoping', count: 1, tcvCents: 10_000, gpCents: 2_000 },
      { stage: 'site_survey', count: 2, tcvCents: 40_000, gpCents: 8_000 },
    ])

    expect(rows).toEqual([
      { stage: 'lead', count: 5, tcvCents: 50_000, gpCents: 10_000 },
      { stage: 'site_survey', count: 3, tcvCents: 50_000, gpCents: 10_000 },
    ])
  })

  it('treats every non-terminal canonical or legacy stage as active Sales work', () => {
    expect(isActiveSalesStage('lead')).toBe(true)
    expect(isActiveSalesStage('contract')).toBe(true)
    expect(isActiveSalesStage('opportunity_creation')).toBe(true)
    expect(isActiveSalesStage('scoping')).toBe(true)
    expect(isActiveSalesStage('won')).toBe(false)
    expect(isActiveSalesStage('closed_won')).toBe(false)
    expect(isActiveSalesStage('lost')).toBe(false)
  })

  it('calculates conversion from normalized stages without treating lost deals as progress', () => {
    const rates = conversionRatesFromStageCounts([
      { stage: 'opportunity_creation', count: 2 },
      { stage: 'lead', count: 3 },
      { stage: 'scoping', count: 1 },
      { stage: 'site_survey', count: 2 },
      { stage: 'lost', count: 4 },
    ])

    expect(rates[0]).toEqual({
      fromStage: 'lead',
      toStage: 'site_survey',
      fromCount: 8,
      toCount: 3,
      ratePct: 37.5,
    })
  })

  it('permits a Kanban transition from a legacy row to its canonical next stage', () => {
    expect(isCompatibleOpportunityTransition('opportunity_creation', 'site_survey')).toBe(true)
    expect(isCompatibleOpportunityTransition('scoping', 'design')).toBe(true)
    expect(isCompatibleOpportunityTransition('opportunity_creation', 'contract')).toBe(false)
  })
})
