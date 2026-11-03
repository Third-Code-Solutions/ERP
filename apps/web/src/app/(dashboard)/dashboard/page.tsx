import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import {
  getDashboardKpis,
  getStageDistribution,
  getRepScorecards,
  getAlerts,
  getConversionRates,
  getMonthlyForecast,
  getTodayCommandCenter,
  getManagementDashboard,
} from '@/lib/dashboard-queries'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { RepScorecardTable } from '@/components/dashboard/rep-scorecard'
import { StageDistributionTable } from '@/components/dashboard/stage-distribution'
import { AlertsPanel } from '@/components/dashboard/alerts-panel'
import { DashboardRealtimeRefresher } from '@/components/dashboard/realtime-refresher'
import { ConversionRateTable } from '@/components/dashboard/conversion-rate-table'
import { ForecastChart } from '@/components/dashboard/forecast-chart'
import { ExportCsvButton } from '@/components/dashboard/export-csv-button'
import { CloseDateFilter } from '@/components/dashboard/close-date-filter'
import { TodayCommandCenter } from '@/components/dashboard/today-command-center'
import { ManagementHealth } from '@/components/dashboard/management-health'
import { loadDashboardForRole } from '@/lib/dashboard-access'
import { canViewPath, roleLabel } from '@/lib/operations/nav-config'

export const metadata: Metadata = { title: 'Dashboard' }

interface DashboardPageProps {
  // Next 15 App Router: searchParams arrives as a Promise.
  searchParams?: Promise<{ since?: string; until?: string; stage?: string }>
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const profile = await requireUserProfile().catch(() => null)
  const renderedAt = new Date()
  const resolvedSearch = (await searchParams) ?? {}

  if (!profile) {
    return (
      <div className="page-header">
        <p className="page-eyebrow">Workspace</p>
        <h1 className="page-title">Dashboard unavailable</h1>
        <p className="page-subtitle">
          Your account is not linked to a tenant. Contact your workspace administrator to be invited.
        </p>
      </div>
    )
  }

  const dashboard = await loadDashboardForRole(profile.role, {
    executive: async () => {
      const [kpis, stages, reps, alerts, conversionRates, forecast, today, management] =
        await Promise.all([
          getDashboardKpis(profile.tenantId),
          getStageDistribution(profile.tenantId),
          getRepScorecards(profile.tenantId),
          getAlerts(profile.tenantId),
          getConversionRates(profile.tenantId),
          getMonthlyForecast(profile.tenantId, 6),
          getTodayCommandCenter(
            profile.tenantId,
            profile.user.id,
            renderedAt,
            canViewPath(profile.role, '/projects')
          ),
          getManagementDashboard(profile.tenantId),
        ])

      return { kpis, stages, reps, alerts, conversionRates, forecast, today, management }
    },
    myWork: () =>
      getTodayCommandCenter(
        profile.tenantId,
        profile.user.id,
        renderedAt,
        canViewPath(profile.role, '/projects')
      ),
  }, {
    onExecutiveFailure: () =>
      getTodayCommandCenter(
        profile.tenantId,
        profile.user.id,
        renderedAt,
        canViewPath(profile.role, '/projects')
      ),
  })

  const fmt = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  })
  const time = new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Manila',
  })

  // since/until only scope the CSV export (ExportCsvButton reads them from the URL).
  void resolvedSearch

  if (dashboard.mode === 'my_work' || dashboard.mode === 'degraded') {
    return (
      <div className="dashboard-page dashboard-page--my-work">
        {dashboard.mode === 'degraded' && (
          <section
            className="dashboard-data-notice"
            role="status"
            aria-label="Dashboard data notice"
          >
            <strong>Executive analytics are temporarily unavailable.</strong>
            <span>
              Your authorized work queue is still current. Retry later for the
              full portfolio view; no records were changed.
            </span>
          </section>
        )}
        <header className="dashboard-hero dashboard-hero--compact">
          <div className="dashboard-hero-copy">
            <h1 className="dashboard-hero-title page-title">
              My work
            </h1>
            <p className="dashboard-hero-subtitle">
              {roleLabel(profile.role)} workspace · {fmt.format(renderedAt)}
            </p>
          </div>
        </header>

        <div className="dashboard-command-center" id="dashboard-command-center">
          <TodayCommandCenter role={profile.role} data={dashboard.data} />
        </div>
      </div>
    )
  }

  const { kpis, stages, reps, alerts, conversionRates, forecast, today, management } =
    dashboard.data

  const canViewPipeline = canViewPath(profile.role, '/pipeline')

  return (
    <div className="dashboard-page">
      <DashboardRealtimeRefresher />

      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h1 className="dashboard-hero-title page-title">
            Workspace overview
          </h1>
          <p className="dashboard-hero-subtitle">
            {roleLabel(profile.role)} workspace · {fmt.format(renderedAt)}
          </p>
          <div className="dashboard-hero-status" aria-label="Dashboard status">
            <span className="dashboard-status-chip dashboard-status-chip--live">
              <span className="live-dot" aria-hidden /> Live workspace
            </span>
            <span className="dashboard-status-chip">Updated {time.format(renderedAt)} PHT</span>
            <span className="dashboard-status-chip">{kpis.activeDeals} active deals</span>
          </div>
        </div>

        <div className="dashboard-hero-actions">
          {canViewPipeline ? (
            <Link className="dashboard-hero-action dashboard-hero-action--primary" href="/pipeline">
              Open pipeline
            </Link>
          ) : null}
          <Link className="dashboard-hero-action" href="/tasks">
            Open my work
          </Link>
        </div>
      </header>

      <div className="dashboard-command-center" id="dashboard-command-center">
        <TodayCommandCenter role={profile.role} data={today} />
      </div>

      <KpiCards kpis={kpis} />

      <ManagementHealth data={management} role={profile.role} />

      <div className="section-grid-2 dashboard-grid-split">
        <StageDistributionTable rows={stages} />
        <AlertsPanel alerts={alerts} role={profile.role} />
      </div>

      <RepScorecardTable reps={reps} />

      <section
        className="dashboard-analytics"
        aria-labelledby="pipeline-analytics-heading"
      >
        <div className="dashboard-section-header">
          <div>
            <h2 id="pipeline-analytics-heading" className="dashboard-section-title">
              Pipeline analytics
            </h2>
            <p className="dashboard-section-description">
              See where opportunities advance and how weighted value is expected to land.
            </p>
          </div>
          <div className="dashboard-analytics-actions">
            <CloseDateFilter />
            <ExportCsvButton />
          </div>
        </div>

        <div className="section-grid-2 dashboard-grid-analytics">
          <ConversionRateTable rows={conversionRates} />
          <ForecastChart data={forecast} />
        </div>
      </section>
    </div>
  )
}
