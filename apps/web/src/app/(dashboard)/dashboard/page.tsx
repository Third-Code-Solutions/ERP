import type { Metadata } from 'next'
import { getUser } from '@buildops/auth'
import {
  getDashboardKpis,
  getStageDistribution,
  getRepScorecards,
  getAlerts,
} from '@/lib/dashboard-queries'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { RepScorecardTable } from '@/components/dashboard/rep-scorecard'
import { StageDistributionTable } from '@/components/dashboard/stage-distribution'
import { AlertsPanel } from '@/components/dashboard/alerts-panel'
import { DashboardRealtimeRefresher } from '@/components/dashboard/realtime-refresher'
import { db } from '@buildops/database'
import { users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Dashboard' }

async function getTenantId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, userId))
  return row?.tenant_id ?? null
}

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

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) return null

  const tenantId = await getTenantId(user.id)
  const renderedAt = new Date()

  if (!tenantId) {
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

  const [kpis, stages, reps, alerts] = await Promise.all([
    getDashboardKpis(tenantId),
    getStageDistribution(tenantId),
    getRepScorecards(tenantId),
    getAlerts(tenantId),
  ])

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

  return (
    <>
      <DashboardRealtimeRefresher />

      <div className="page-header">
        <div className="page-toolbar">
          <div>
            <p className="page-eyebrow">Executive Overview</p>
            <h1 className="page-title">
              {greetingFor(renderedAt)}, {firstName(user.email)}
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

      <KpiCards kpis={kpis} />

      <div className="section-grid-2">
        <StageDistributionTable rows={stages} />
        <AlertsPanel alerts={alerts} />
      </div>

      <RepScorecardTable reps={reps} />
    </>
  )
}
