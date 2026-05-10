import { db } from '@buildops/database'
import { boms, invoices, opportunities, projects, purchaseOrders, users } from '@buildops/database/schema'
import { eq, and, inArray, lt, sum, count, sql, desc } from 'drizzle-orm'

export interface KpiData {
  activeTcv: number
  activeGp: number
  closedWonTcv: number
  activeDeals: number
  coverageLeads: number
  weightedPipeline: number
}

export interface RepScorecard {
  repId: string
  repEmail: string
  activeTcv: number
  activeGp: number
  gpMarginBps: number
  wonTcv: number
  lostCount: number
  wonCount: number
  activeCount: number
  weightedTcv: number
}

export interface StageRow {
  stage: string
  count: number
  tcvCents: number
  gpCents: number
}

export interface Alert {
  type: 'low_margin' | 'stalled_deal' | 'overdue_invoice' | 'gp_erosion'
  severity: 'warning' | 'danger'
  label: string
  detail: string
  href: string
}

const ACTIVE_STAGES = [
  'opportunity_creation',
  'scoping',
  'bom_submission',
  'resubmission',
  'negotiation',
] as const

export async function getDashboardKpis(tenantId: string): Promise<KpiData> {
  const [activeResult] = await db
    .select({
      tcv: sum(opportunities.tcv_cents),
      gp: sum(opportunities.gp_cents),
      weighted: sum(opportunities.weighted_tcv_cents),
      deals: count(),
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenant_id, tenantId),
        inArray(opportunities.stage, [...ACTIVE_STAGES])
      )
    )

  const [wonResult] = await db
    .select({ tcv: sum(opportunities.tcv_cents) })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenant_id, tenantId),
        eq(opportunities.stage, 'closed_won')
      )
    )

  const [leadResult] = await db
    .select({ leads: count() })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenant_id, tenantId),
        eq(opportunities.stage, 'opportunity_creation')
      )
    )

  return {
    activeTcv: Number(activeResult?.tcv ?? 0),
    activeGp: Number(activeResult?.gp ?? 0),
    closedWonTcv: Number(wonResult?.tcv ?? 0),
    activeDeals: Number(activeResult?.deals ?? 0),
    coverageLeads: Number(leadResult?.leads ?? 0),
    weightedPipeline: Number(activeResult?.weighted ?? 0),
  }
}

export async function getStageDistribution(tenantId: string): Promise<StageRow[]> {
  const rows = await db
    .select({
      stage: opportunities.stage,
      count: count(),
      tcvCents: sum(opportunities.tcv_cents),
      gpCents: sum(opportunities.gp_cents),
    })
    .from(opportunities)
    .where(eq(opportunities.tenant_id, tenantId))
    .groupBy(opportunities.stage)

  return rows.map((r) => ({
    stage: r.stage,
    count: Number(r.count),
    tcvCents: Number(r.tcvCents ?? 0),
    gpCents: Number(r.gpCents ?? 0),
  }))
}

export async function getRepScorecards(tenantId: string): Promise<RepScorecard[]> {
  const activeRows = await db
    .select({
      repId: opportunities.rep_id,
      tcv: sum(opportunities.tcv_cents),
      gp: sum(opportunities.gp_cents),
      weighted: sum(opportunities.weighted_tcv_cents),
      activeCount: count(),
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenant_id, tenantId),
        inArray(opportunities.stage, [...ACTIVE_STAGES])
      )
    )
    .groupBy(opportunities.rep_id)

  const wonRows = await db
    .select({
      repId: opportunities.rep_id,
      wonTcv: sum(opportunities.tcv_cents),
      wonCount: count(),
    })
    .from(opportunities)
    .where(
      and(eq(opportunities.tenant_id, tenantId), eq(opportunities.stage, 'closed_won'))
    )
    .groupBy(opportunities.rep_id)

  const lostRows = await db
    .select({ repId: opportunities.rep_id, lostCount: count() })
    .from(opportunities)
    .where(
      and(eq(opportunities.tenant_id, tenantId), eq(opportunities.stage, 'closed_lost'))
    )
    .groupBy(opportunities.rep_id)

  const repIds = [
    ...new Set([
      ...activeRows.map((r) => r.repId),
      ...wonRows.map((r) => r.repId),
      ...lostRows.map((r) => r.repId),
    ]),
  ].filter(Boolean) as string[]

  if (repIds.length === 0) return []

  const repUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, repIds))

  const emailMap = new Map(repUsers.map((u) => [u.id, u.email]))
  const wonMap = new Map(wonRows.map((r) => [r.repId, r]))
  const lostMap = new Map(lostRows.map((r) => [r.repId, r]))

  return activeRows.map((ar) => {
    const tcv = Number(ar.tcv ?? 0)
    const gp = Number(ar.gp ?? 0)
    const won = wonMap.get(ar.repId ?? '')
    return {
      repId: ar.repId ?? '',
      repEmail: emailMap.get(ar.repId ?? '') ?? 'Unknown',
      activeTcv: tcv,
      activeGp: gp,
      gpMarginBps: tcv > 0 ? Math.round((gp / tcv) * 10000) : 0,
      wonTcv: Number(won?.wonTcv ?? 0),
      wonCount: Number(won?.wonCount ?? 0),
      lostCount: Number(lostMap.get(ar.repId ?? '')?.lostCount ?? 0),
      activeCount: Number(ar.activeCount ?? 0),
      weightedTcv: Number(ar.weighted ?? 0),
    }
  })
}

const LOW_MARGIN_THRESHOLD_BPS = 1500 // 15%
const STALLED_DAYS = 30

export async function getAlerts(tenantId: string): Promise<Alert[]> {
  const alerts: Alert[] = []

  // Low-margin active opportunities (GP margin < 15%)
  const activeOpps = await db
    .select({
      id: opportunities.id,
      project_id: opportunities.project_id,
      stage: opportunities.stage,
      tcv_cents: opportunities.tcv_cents,
      gp_cents: opportunities.gp_cents,
      updated_at: opportunities.updated_at,
      project_name: projects.name,
    })
    .from(opportunities)
    .leftJoin(projects, eq(opportunities.project_id, projects.id))
    .where(
      and(
        eq(opportunities.tenant_id, tenantId),
        inArray(opportunities.stage, [...ACTIVE_STAGES])
      )
    )

  for (const opp of activeOpps) {
    const tcv = opp.tcv_cents
    const gp = opp.gp_cents
    if (tcv > 0) {
      const marginBps = Math.round((gp / tcv) * 10000)
      if (marginBps < LOW_MARGIN_THRESHOLD_BPS) {
        alerts.push({
          type: 'low_margin',
          severity: marginBps < 1000 ? 'danger' : 'warning',
          label: opp.project_name ?? 'Unknown project',
          detail: `GP margin ${(marginBps / 100).toFixed(1)}% — below 15% threshold`,
          href: `/projects/${opp.project_id}`,
        })
      }
    }

    // Stalled deal
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(opp.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSinceUpdate >= STALLED_DAYS) {
      alerts.push({
        type: 'stalled_deal',
        severity: 'warning',
        label: opp.project_name ?? 'Unknown project',
        detail: `No activity for ${daysSinceUpdate} days in ${opp.stage.replace(/_/g, ' ')}`,
        href: `/projects/${opp.project_id}`,
      })
    }
  }

  // Overdue invoices
  const overdueInvoices = await db
    .select({
      id: invoices.id,
      project_id: invoices.project_id,
      invoice_number: invoices.invoice_number,
      due_date: invoices.due_date,
      net_amount_cents: invoices.net_amount_cents,
      project_name: projects.name,
    })
    .from(invoices)
    .leftJoin(projects, eq(invoices.project_id, projects.id))
    .where(
      and(
        eq(invoices.tenant_id, tenantId),
        eq(invoices.status, 'overdue'),
        lt(invoices.due_date, new Date())
      )
    )

  for (const inv of overdueInvoices) {
    alerts.push({
      type: 'overdue_invoice',
      severity: 'danger',
      label: inv.project_name ?? 'Unknown project',
      detail: `${inv.invoice_number} — ₱${((inv.net_amount_cents ?? 0) / 100).toLocaleString()} overdue`,
      href: `/projects/${inv.project_id}/billing`,
    })
  }

  // GP erosion: active projects where PO committed cost exceeds BOM budget by >10%
  const lockedBoms = await db
    .select({
      id: boms.id,
      project_id: boms.project_id,
      total_cost_cents: boms.total_cost_cents,
      project_name: projects.name,
    })
    .from(boms)
    .leftJoin(projects, eq(boms.project_id, projects.id))
    .where(
      and(
        eq(boms.tenant_id, tenantId),
        inArray(boms.status, ['approved', 'locked'])
      )
    )
    .orderBy(desc(boms.created_at))

  // Deduplicate to latest BOM per project
  const latestBomByProject = new Map<string, typeof lockedBoms[number]>()
  for (const b of lockedBoms) {
    if (b.project_id && !latestBomByProject.has(b.project_id)) {
      latestBomByProject.set(b.project_id, b)
    }
  }

  const COMMITTED_STATUSES = ['submitted', 'confirmed', 'partial_delivery', 'delivered'] as const

  for (const [projectId, bom] of latestBomByProject) {
    if (bom.total_cost_cents === 0) continue

    const [poSum] = await db
      .select({ total: sum(purchaseOrders.total_cents) })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenant_id, tenantId),
          eq(purchaseOrders.project_id, projectId),
          inArray(purchaseOrders.status, [...COMMITTED_STATUSES])
        )
      )

    const committed = Number(poSum?.total ?? 0)
    if (committed === 0) continue

    const overrunPct = ((committed - bom.total_cost_cents) / bom.total_cost_cents) * 100
    if (overrunPct > 10) {
      alerts.push({
        type: 'gp_erosion',
        severity: overrunPct > 25 ? 'danger' : 'warning',
        label: bom.project_name ?? 'Unknown project',
        detail: `PO committed ${overrunPct.toFixed(0)}% over BOM budget`,
        href: `/projects/${projectId}/bom`,
      })
    }
  }

  // Sort: danger first, then by type
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'danger' ? -1 : 1
    return 0
  })
}
