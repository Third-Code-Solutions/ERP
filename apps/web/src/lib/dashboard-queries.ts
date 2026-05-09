import { db } from '@buildops/database'
import { opportunities, users } from '@buildops/database/schema'
import { eq, and, inArray, sum, count, sql } from 'drizzle-orm'

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
