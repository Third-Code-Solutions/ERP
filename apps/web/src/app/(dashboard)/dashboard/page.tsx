import type { Metadata } from 'next'
import { getUser } from '@buildops/auth'
import { getDashboardKpis, getStageDistribution, getRepScorecards, getAlerts } from '@/lib/dashboard-queries'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { RepScorecardTable } from '@/components/dashboard/rep-scorecard'
import { StageDistributionTable } from '@/components/dashboard/stage-distribution'
import { AlertsPanel } from '@/components/dashboard/alerts-panel'
import { db } from '@buildops/database'
import { users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Dashboard' }

async function getTenantId(userId: string): Promise<string | null> {
  const [row] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, userId))
  return row?.tenant_id ?? null
}

export default async function DashboardPage() {
  const user = await getUser()
  if (!user) return null

  const tenantId = await getTenantId(user.id)

  if (!tenantId) {
    return (
      <div className="page-header">
        <h1 className="page-title">Executive Dashboard</h1>
        <p className="page-subtitle">Tenant not configured. Contact your workspace administrator.</p>
      </div>
    )
  }

  const [kpis, stages, reps, alerts] = await Promise.all([
    getDashboardKpis(tenantId),
    getStageDistribution(tenantId),
    getRepScorecards(tenantId),
    getAlerts(tenantId),
  ])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Executive Dashboard</h1>
        <p className="page-subtitle">Live pipeline, GP, and project health</p>
      </div>

      <KpiCards kpis={kpis} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
        <StageDistributionTable rows={stages} />
        <AlertsPanel alerts={alerts} />
      </div>

      <RepScorecardTable reps={reps} />
    </div>
  )
}
