import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ProjectPerformanceResult } from '@third-code-erp/shared-types'
import { ProjectPerformanceCard } from './project-performance-card'

const RESULT: ProjectPerformanceResult = {
  projectId: '33333333-3333-4333-8333-333333333333',
  asOf: '2026-09-10T00:00:00.000Z',
  currency: 'PHP',
  status: 'partial' as const,
  baselineCents: 1_000_000,
  plannedValueCents: 500_000,
  earnedValueCents: 400_000,
  actualCostCents: 350_000,
  estimateAtCompletionCents: 875_000,
  estimateToCompleteCents: 525_000,
  varianceAtCompletionCents: 125_000,
  costVarianceCents: 50_000,
  scheduleVarianceCents: -100_000,
  costPerformanceIndexBps: 11_429,
  schedulePerformanceIndexBps: 8_000,
  plannedPercentComplete: 50,
  actualPercentComplete: 40,
  latestProgressWeekEnding: null,
  progressSource: 'normalized_schedule' as const,
  plannedValueSource: 'normalized_schedule_labor' as const,
  actualCostSource: 'posted_supplier_bills' as const,
  actualCostEvidenceCount: 4,
  missingEvidence: ['actual_progress'],
  notes: ['Actual progress uses normalized schedule task completion.'],
}

describe('ProjectPerformanceCard', () => {
  it('renders EVM metrics and evidence caveats', () => {
    const markup = renderToStaticMarkup(<ProjectPerformanceCard performance={RESULT} />)
    expect(markup).toContain('Earned value / CVR')
    expect(markup).toContain('EVM')
    expect(markup).toContain('Missing evidence')
    expect(markup).toContain('CPI')
  })

  it('renders an unavailable state without fabricating metrics', () => {
    const markup = renderToStaticMarkup(<ProjectPerformanceCard performance={null} error="Core unavailable" />)
    expect(markup).toContain('Core unavailable')
    expect(markup).not.toContain('BAC')
  })
})
