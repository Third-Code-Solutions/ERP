import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('./close-date-filter', () => ({ CloseDateFilter: () => 'Sales representative filter' }))
vi.mock('./conversion-rate-table', () => ({ ConversionRateTable: () => 'Stage Conversion' }))
vi.mock('./export-csv-button', () => ({ ExportCsvButton: () => 'Export CSV' }))
vi.mock('./forecast-chart', () => ({ ForecastChart: () => 'Forecast' }))
vi.mock('./kpi-cards', () => ({ KpiCards: () => 'Pipeline KPIs' }))
vi.mock('./rep-scorecard', () => ({ RepScorecardTable: () => 'Sales Rep Scorecard' }))
vi.mock('./stage-distribution', () => ({ StageDistributionTable: () => 'Pipeline Stages' }))
vi.mock('./today-command-center', () => ({ TodayCommandCenter: () => 'Today command center' }))

import { SalesPipelineDashboard } from './sales-pipeline-dashboard'

const data = {
  kpis: {
    activeTcv: 1_000_000,
    activeGp: 200_000,
    closedWonTcv: 0,
    activeDeals: 1,
    coverageLeads: 1,
    weightedPipeline: 500_000,
  },
  stages: [{ stage: 'lead', count: 1, tcvCents: 1_000_000, gpCents: 200_000 }],
  reps: [],
  conversionRates: [],
  forecast: { months: [], byRep: {}, repLabels: {} },
  today: { summary: { dueToday: 0, overdue: 0, upcoming: 0 }, tasks: [], projects: [] },
  salesReps: [],
}

describe('SalesPipelineDashboard', () => {
  it('keeps Sales focused on pipeline work rather than executive project-cost health', () => {
    const markup = renderToStaticMarkup(
      <SalesPipelineDashboard role="sales" data={data} filterErrors={[]} />
    )

    expect(markup).toContain('Pipeline performance')
    expect(markup).toContain('Pipeline Stages')
    expect(markup).toContain('Stage Conversion')
    expect(markup).not.toContain('Project margin &amp; exposure')
    expect(markup).not.toContain('Permit exposure')
    expect(markup).not.toContain('Unsigned VO')
  })
})
