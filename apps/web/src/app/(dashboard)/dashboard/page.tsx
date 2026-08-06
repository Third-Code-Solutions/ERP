import type { Metadata } from 'next'
import { requireUserProfile } from '@third-code-erp/auth'
import {
  getDashboardKpis,
  getStageDistribution,
  getRepScorecards,
  getAlerts,
  getConversionRates,
  getMonthlyForecast,
  getTodayCommandCenter,
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
import { loadDashboardForRole } from '@/lib/dashboard-access'
import { canViewPath, roleLabel } from '@/lib/operations/nav-config'

export const metadata: Metadata = { title: 'Dashboard' }

function greetingFor(date: Date): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function firstName(email: string | undefined): string {
  if (!email) return 'there'
  const local = email.split('@')[0] ?? ''
  const part = local.split(/[._-]/)[0] ?? ''
  return part.charAt(0).toUpperCase() + part.slice(1) || 'there'
}

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
      const [kpis, stages, reps, alerts, conversionRates, forecast, today] =
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
        ])

      return { kpis, stages, reps, alerts, conversionRates, forecast, today }
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

  // Reference search params so a future stage-filter widget can drive the
  // dashboard; for now they only flow into ExportCsvButton via the URL.
  void resolvedSearch

  if (dashboard.mode === 'my_work' || dashboard.mode === 'degraded') {
    return (
      <>
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
        <div className="page-header">
          <p className="page-eyebrow">Today · {roleLabel(profile.role)}</p>
          <h1 className="page-title">
            {greetingFor(renderedAt)}, {firstName(profile.email)}
          </h1>
          <p className="page-subtitle">
            Your assigned work and authorized workspaces for{' '}
            {fmt.format(renderedAt)}.
          </p>
        </div>

        <TodayCommandCenter role={profile.role} data={dashboard.data} />
      </>
    )
  }

  const { kpis, stages, reps, alerts, conversionRates, forecast, today } =
    dashboard.data

  return (
    <>
      <DashboardRealtimeRefresher />

      <div className="page-header">
        <div className="page-toolbar">
          <div>
            <p className="page-eyebrow">Executive Overview</p>
            <h1 className="page-title">
              {greetingFor(renderedAt)}, {firstName(profile.email)}
            </h1>
            <p className="page-subtitle">
              Live pipeline, gross profit and project health for {fmt.format(renderedAt)}.
            </p>
          </div>

          <div className="page-meta">
            <span className="page-meta-item">
              <span className="live-dot" aria-hidden /> Live
            </span>
            <span className="page-meta-item">
              Updated {time.format(renderedAt)} PHT
            </span>
            <span className="page-meta-item">{kpis.activeDeals} active deals</span>
          </div>
        </div>
      </div>

      <TodayCommandCenter role={profile.role} data={today} />

      <KpiCards kpis={kpis} />

      <div className="section-grid-2">
        <StageDistributionTable rows={stages} />
        <AlertsPanel alerts={alerts} />
      </div>

      <RepScorecardTable reps={reps} />

      <section
        aria-labelledby="pipeline-analytics-heading"
        style={{ marginTop: 32 }}
      >
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
          <h2
            id="pipeline-analytics-heading"
            style={{ fontSize: 16, fontWeight: 600, margin: 0 }}
          >
            Pipeline analytics
          </h2>
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <CloseDateFilter />
            <ExportCsvButton />
          </div>
        </div>

        <div className="section-grid-2">
          <ConversionRateTable rows={conversionRates} />
          <ForecastChart data={forecast} />
        </div>
      </section>
    </>
  )
}
