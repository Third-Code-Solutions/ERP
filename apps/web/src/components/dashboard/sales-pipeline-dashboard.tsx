import React from 'react'
import type { AppRole } from '@third-code-erp/auth'

import type {
  ConversionRateRow,
  KpiData,
  MonthlyForecastData,
  RepScorecard,
  SalesRepOption,
  StageRow,
  TodayCommandCenterData,
} from '@/lib/dashboard-queries'
import { CloseDateFilter } from './close-date-filter'
import { ConversionRateTable } from './conversion-rate-table'
import { ExportCsvButton } from './export-csv-button'
import { ForecastChart } from './forecast-chart'
import { KpiCards } from './kpi-cards'
import { RepScorecardTable } from './rep-scorecard'
import { StageDistributionTable } from './stage-distribution'
import { TodayCommandCenter } from './today-command-center'

export interface SalesPipelineDashboardData {
  kpis: KpiData
  stages: StageRow[]
  reps: RepScorecard[]
  conversionRates: ConversionRateRow[]
  forecast: MonthlyForecastData
  today: TodayCommandCenterData
  salesReps: SalesRepOption[]
}

interface SalesPipelineDashboardProps {
  role: AppRole
  data: SalesPipelineDashboardData
  filterErrors: readonly string[]
}

/**
 * Sales receives a pipeline operating view, not the executive project's cost,
 * permit, and variation-order health screen. The same centralized capability
 * still governs the data loaders; this component only keeps the role's
 * dashboard information architecture aligned with its work.
 */
export function SalesPipelineDashboard({
  role,
  data,
  filterErrors,
}: SalesPipelineDashboardProps) {
  return (
    <>
      {filterErrors.length > 0 && (
        <section className="dashboard-data-notice" role="status">
          <strong>Dashboard filters were not applied.</strong>
          <span>{filterErrors.join(' ')}</span>
        </section>
      )}

      <TodayCommandCenter role={role} data={data.today} />

      <section aria-labelledby="sales-pipeline-heading" style={{ marginTop: 32 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div>
            <h2 id="sales-pipeline-heading" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
              Pipeline performance
            </h2>
            <p className="card-subtitle">
              Filters apply to all Sales pipeline metrics and the CSV export.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <CloseDateFilter reps={data.salesReps} />
            <ExportCsvButton />
          </div>
        </div>

        <KpiCards kpis={data.kpis} />

        <div className="section-grid-2">
          <StageDistributionTable rows={data.stages} />
          <ConversionRateTable rows={data.conversionRates} />
        </div>

        <div className="section-grid-2" style={{ marginTop: 24 }}>
          <ForecastChart data={data.forecast} />
          <RepScorecardTable reps={data.reps} />
        </div>
      </section>
    </>
  )
}
