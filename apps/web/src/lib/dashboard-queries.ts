import { db } from '@third-code-erp/database'
import {
  boms,
  dailyTasks,
  invoices,
  opportunities,
  permits,
  processSteps,
  projects,
  slaClocks,
  taskInstances,
  users,
  variationOrders,
} from '@third-code-erp/database/schema'
import {
  eq,
  and,
  inArray,
  notInArray,
  lt,
  gt,
  gte,
  lte,
  or,
  sum,
  count,
  sql,
  asc,
  desc,
} from 'drizzle-orm'
import { computeProjectCostSnapshot } from '@third-code-erp/shared-types/cost'
import { manilaBoundaries } from '@/lib/operations/cadence-engine'
import { getProjectCostControlTotalsForProjects } from '@/lib/operations/project-cost-control'
import {
  getTodayThroughCoreApi,
  todayReadsUseCoreApi,
} from '@/lib/erp-core-client'

export interface KpiData {
  activeTcv: number
  activeGp: number
  closedWonTcv: number
  activeDeals: number
  coverageLeads: number
  weightedPipeline: number
}

export interface MyWorkSummary {
  dueToday: number
  overdue: number
  upcoming: number
}

export interface TodayTask {
  id: string
  title: string
  projectId: string
  projectName: string
  dueDate: Date
  dueState: 'overdue' | 'today' | 'upcoming'
}

export interface TodayProject {
  id: string
  name: string
  client: string
  status: string
  updatedAt: Date
}

export interface TodayCommandCenterData {
  summary: MyWorkSummary
  tasks: TodayTask[]
  projects: TodayProject[]
}

export async function getMyWorkSummary(
  tenantId: string,
  userId: string,
  now = new Date()
): Promise<MyWorkSummary> {
  const todayStart = manilaBoundaries.startOfDay(now)
  const todayEnd = manilaBoundaries.endOfDay(now)
  const weekEnd = new Date(todayEnd.getTime() + 7 * 86_400_000)
  const base = [
    eq(dailyTasks.tenant_id, tenantId),
    eq(dailyTasks.assignee_id, userId),
    eq(dailyTasks.status, 'pending'),
  ] as const

  const [todayRows, overdueRows, upcomingRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(dailyTasks)
      .where(
        and(
          ...base,
          gte(dailyTasks.due_date, todayStart),
          lte(dailyTasks.due_date, todayEnd)
        )
      ),
    db
      .select({ value: count() })
      .from(dailyTasks)
      .where(and(...base, lt(dailyTasks.due_date, now))),
    db
      .select({ value: count() })
      .from(dailyTasks)
      .where(
        and(
          ...base,
          gt(dailyTasks.due_date, todayEnd),
          lte(dailyTasks.due_date, weekEnd)
        )
      ),
  ])

  return {
    dueToday: Number(todayRows[0]?.value ?? 0),
    overdue: Number(overdueRows[0]?.value ?? 0),
    upcoming: Number(upcomingRows[0]?.value ?? 0),
  }
}

export async function getTodayCommandCenter(
  tenantId: string,
  userId: string,
  now = new Date(),
  includeProjects = false
): Promise<TodayCommandCenterData> {
  if (todayReadsUseCoreApi(tenantId)) {
    const result = await getTodayThroughCoreApi(includeProjects)
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Today data was not read')
    }
    return {
      summary: result.data.summary,
      tasks: result.data.tasks.map((task) => ({
        ...task,
        dueDate: new Date(task.dueDate),
      })),
      projects: result.data.projects.map((project) => ({
        ...project,
        updatedAt: new Date(project.updatedAt),
      })),
    }
  }

  const todayEnd = manilaBoundaries.endOfDay(now)
  const weekEnd = new Date(todayEnd.getTime() + 7 * 86_400_000)

  const [summary, taskRows, projectRows] = await Promise.all([
    getMyWorkSummary(tenantId, userId, now),
    db
      .select({
        id: dailyTasks.id,
        title: dailyTasks.title,
        projectId: dailyTasks.project_id,
        projectName: projects.name,
        dueDate: dailyTasks.due_date,
      })
      .from(dailyTasks)
      .innerJoin(
        projects,
        and(
          eq(projects.id, dailyTasks.project_id),
          eq(projects.tenant_id, tenantId)
        )
      )
      .where(
        and(
          eq(dailyTasks.tenant_id, tenantId),
          eq(dailyTasks.assignee_id, userId),
          eq(dailyTasks.status, 'pending'),
          lte(dailyTasks.due_date, weekEnd)
        )
      )
      .orderBy(asc(dailyTasks.due_date))
      .limit(8),
    includeProjects
      ? db
          .select({
            id: projects.id,
            name: projects.name,
            client: projects.client,
            status: projects.status,
            updatedAt: projects.updated_at,
          })
          .from(projects)
          .where(
            and(
              eq(projects.tenant_id, tenantId),
              inArray(projects.status, ['lead', 'active', 'on_hold'])
            )
          )
          .orderBy(desc(projects.updated_at))
          .limit(6)
      : Promise.resolve([]),
  ])

  return {
    summary,
    tasks: taskRows.map((task) => ({
      ...task,
      dueDate: task.dueDate,
      dueState:
        task.dueDate < now
          ? 'overdue'
          : task.dueDate <= todayEnd
            ? 'today'
            : 'upcoming',
    })),
    projects: projectRows.map((project) => ({
      ...project,
      updatedAt: project.updatedAt,
    })),
  }
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
  type: 'low_margin' | 'stalled_deal' | 'overdue_invoice' | 'gp_erosion' | 'gp_erosion_actual'
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

// Canonical ABI OPS 8-stage flow (REFACTOR.md M1 US-002). Pairs of
// adjacent stages drive conversion-rate computation in the dashboard.
export const PIPELINE_STAGES = [
  'lead',
  'site_survey',
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export interface ConversionRateRow {
  fromStage: PipelineStage
  toStage: PipelineStage
  fromCount: number
  toCount: number
  ratePct: number
}

export interface MonthlyForecastData {
  months: string[] // ISO YYYY-MM
  byRep: Record<string, number[]> // weighted_tcv_cents per month
  repLabels: Record<string, string>
}

export interface ManagementProjectMarginRow {
  projectId: string
  projectName: string
  projectCode: string | null
  projectStatus: string
  tcvCents: number
  baselineCostCents: number
  forecastCostCents: number
  baselineMarginBps: number
  forecastMarginBps: number
  marginVarianceBps: number
  costVarianceCents: number
  permitExposureCount: number
  permitOverdueCount: number
  unsignedVoExposureCents: number
  hasApprovedBom: boolean
  hasApprovedBudget: boolean
}

export interface ManagementSlaBreachRow {
  businessUnit: string
  breachCount: number
}

export interface ManagementDashboardData {
  projectMargins: ManagementProjectMarginRow[]
  slaBreachesByBu: ManagementSlaBreachRow[]
  totals: {
    permitExposureCount: number
    permitOverdueCount: number
    unsignedVoExposureCents: number
    slaBreachCount: number
  }
}

function marginBps(tcvCents: number, marginCents: number): number {
  if (tcvCents <= 0) return 0
  return Math.round((marginCents * 10000) / tcvCents)
}

/**
 * Monday-meeting view for the executive dashboard. Cost figures come from
 * the WO-17 cost-control source of truth; the remaining exposures are
 * intentionally separate signals so unsigned scope or operational risk is
 * not mistaken for posted margin.
 */
export async function getManagementDashboard(
  tenantId: string
): Promise<ManagementDashboardData> {
  const [projectRows, bomRows, unsignedVoRows, permitRows, slaRows] =
    await Promise.all([
      db
        .select({
          id: projects.id,
          name: projects.name,
          projectCode: projects.project_code,
          status: projects.status,
        })
        .from(projects)
        .where(
          and(
            eq(projects.tenant_id, tenantId),
            inArray(projects.status, ['active', 'on_hold'])
          )
        )
        .orderBy(projects.name),
      db
        .select({
          projectId: boms.project_id,
          tcvCents: boms.tcv_cents,
        })
        .from(boms)
        .where(
          and(
            eq(boms.tenant_id, tenantId),
            inArray(boms.status, ['approved', 'locked'])
          )
        )
        .orderBy(desc(boms.created_at)),
      db
        .select({
          projectId: variationOrders.project_id,
          exposureCents: sum(variationOrders.cost_impact_cents),
        })
        .from(variationOrders)
        .where(
          and(
            eq(variationOrders.tenant_id, tenantId),
            inArray(variationOrders.status, [
              'draft',
              'pending_commercial_pricing',
              'pending_client_signature',
            ])
          )
        )
        .groupBy(variationOrders.project_id),
      db
        .select({
          projectId: permits.project_id,
          exposureCount: count(),
          overdueCount: sql<number>`count(*) filter (
            where ${permits.expected_return_at} is not null
              and ${permits.expected_return_at} < now()
          )`,
        })
        .from(permits)
        .where(
          and(
            eq(permits.tenant_id, tenantId),
            notInArray(permits.status, [
              'approved',
              'released',
              'refunded',
              'cancelled',
              'rejected',
            ])
          )
        )
        .groupBy(permits.project_id),
      db
        .select({
          businessUnit: processSteps.responsible_bu,
          breachCount: count(),
        })
        .from(slaClocks)
        .innerJoin(
          taskInstances,
          and(
            eq(taskInstances.id, slaClocks.task_instance_id),
            eq(taskInstances.tenant_id, slaClocks.tenant_id)
          )
        )
        .innerJoin(
          processSteps,
          and(
            eq(processSteps.id, taskInstances.process_step_id),
            eq(processSteps.tenant_id, taskInstances.tenant_id)
          )
        )
        .where(
          and(
            eq(slaClocks.tenant_id, tenantId),
            eq(slaClocks.clock_scope, 'internal'),
            or(
              inArray(slaClocks.status, ['breached', 'escalated']),
              and(
                inArray(slaClocks.status, ['running', 'paused']),
                lt(slaClocks.due_at, new Date())
              )
            )
          )
        )
        .groupBy(processSteps.responsible_bu)
        .orderBy(desc(count())),
    ])

  const latestBomByProject = new Map<string, (typeof bomRows)[number]>()
  for (const bom of bomRows) {
    if (bom.projectId && !latestBomByProject.has(bom.projectId)) {
      latestBomByProject.set(bom.projectId, bom)
    }
  }
  const voExposureByProject = new Map(
    unsignedVoRows.map((row) => [row.projectId, Number(row.exposureCents ?? 0)])
  )
  const permitByProject = new Map(
    permitRows.map((row) => [
      row.projectId,
      {
        exposureCount: Number(row.exposureCount ?? 0),
        overdueCount: Number(row.overdueCount ?? 0),
      },
    ])
  )

  const costControlTotalsByProject = await getProjectCostControlTotalsForProjects({
    tenantId,
    projectIds: projectRows.map((project) => project.id),
  })

  const projectMargins = projectRows.map((project) => {
    const bom = latestBomByProject.get(project.id)
    const controlTotals = costControlTotalsByProject.get(project.id)
    const tcvCents = bom?.tcvCents ?? 0
    const baselineCostCents = controlTotals?.baselineCents ?? 0
    const forecastCostCents = controlTotals?.forecastCents ?? 0
    const hasApprovedBudget = baselineCostCents > 0
    const baselineMarginBps =
      hasApprovedBudget ? marginBps(tcvCents, tcvCents - baselineCostCents) : 0
    const forecastMarginBps =
      hasApprovedBudget ? marginBps(tcvCents, tcvCents - forecastCostCents) : 0
    const permit = permitByProject.get(project.id)
    return {
      projectId: project.id,
      projectName: project.name,
      projectCode: project.projectCode,
      projectStatus: project.status,
      tcvCents,
      baselineCostCents,
      forecastCostCents,
      baselineMarginBps,
      forecastMarginBps,
      marginVarianceBps: forecastMarginBps - baselineMarginBps,
      costVarianceCents: forecastCostCents - baselineCostCents,
      permitExposureCount: permit?.exposureCount ?? 0,
      permitOverdueCount: permit?.overdueCount ?? 0,
      unsignedVoExposureCents: voExposureByProject.get(project.id) ?? 0,
      hasApprovedBom: Boolean(bom),
      hasApprovedBudget,
    }
  })

  const slaBreachesByBu = slaRows.map((row) => ({
    businessUnit: row.businessUnit,
    breachCount: Number(row.breachCount ?? 0),
  }))

  return {
    projectMargins,
    slaBreachesByBu,
    totals: {
      permitExposureCount: projectMargins.reduce(
        (total, row) => total + row.permitExposureCount,
        0
      ),
      permitOverdueCount: projectMargins.reduce(
        (total, row) => total + row.permitOverdueCount,
        0
      ),
      unsignedVoExposureCents: projectMargins.reduce(
        (total, row) => total + row.unsignedVoExposureCents,
        0
      ),
      slaBreachCount: slaBreachesByBu.reduce(
        (total, row) => total + row.breachCount,
        0
      ),
    },
  }
}

export async function getDashboardKpis(tenantId: string): Promise<KpiData> {
  const now = new Date()
  const fiscalYearStart = manilaBoundaries.startOfDay(
    new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  )

  const [[activeResult], [wonResult], [leadResult]] = await Promise.all([
    db
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
      ),
    db
      .select({ tcv: sum(opportunities.tcv_cents) })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenant_id, tenantId),
          eq(opportunities.stage, 'closed_won'),
          gte(opportunities.closing_date, fiscalYearStart),
          lte(opportunities.closing_date, now)
        )
      ),
    db
      .select({ leads: count() })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenant_id, tenantId),
          eq(opportunities.stage, 'opportunity_creation')
        )
      ),
  ])

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
  const [activeRows, wonRows, lostRows] = await Promise.all([
    db
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
      .groupBy(opportunities.rep_id),
    db
      .select({
        repId: opportunities.rep_id,
        wonTcv: sum(opportunities.tcv_cents),
        wonCount: count(),
      })
      .from(opportunities)
      .where(
        and(eq(opportunities.tenant_id, tenantId), eq(opportunities.stage, 'closed_won'))
      )
      .groupBy(opportunities.rep_id),
    db
      .select({ repId: opportunities.rep_id, lostCount: count() })
      .from(opportunities)
      .where(
        and(eq(opportunities.tenant_id, tenantId), eq(opportunities.stage, 'closed_lost'))
      )
      .groupBy(opportunities.rep_id),
  ])

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

  const now = new Date()
  const [activeOpps, overdueInvoices, lockedBoms] = await Promise.all([
    // Low-margin active opportunities (GP margin < 15%).
    db
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
      ),
    // Overdue invoices.
    db
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
          lt(invoices.due_date, now)
        )
      ),
    // GP erosion: active projects where PO committed cost exceeds BOM budget by >10%.
    db
      .select({
        id: boms.id,
        project_id: boms.project_id,
        total_cost_cents: boms.total_cost_cents,
        tcv_cents: boms.tcv_cents,
        gp_cents: boms.gp_cents,
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
      .orderBy(desc(boms.created_at)),
  ])

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
      (now.getTime() - new Date(opp.updated_at).getTime()) / (1000 * 60 * 60 * 24)
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

  for (const inv of overdueInvoices) {
    alerts.push({
      type: 'overdue_invoice',
      severity: 'danger',
      label: inv.project_name ?? 'Unknown project',
      detail: `${inv.invoice_number} — ₱${((inv.net_amount_cents ?? 0) / 100).toLocaleString()} overdue`,
      href: `/projects/${inv.project_id}/billing`,
    })
  }

  // Deduplicate to latest BOM per project
  const latestBomByProject = new Map<string, typeof lockedBoms[number]>()
  for (const b of lockedBoms) {
    if (b.project_id && !latestBomByProject.has(b.project_id)) {
      latestBomByProject.set(b.project_id, b)
    }
  }

  const trackedBomProjects = [...latestBomByProject].filter(
    ([, bom]) => bom.total_cost_cents !== 0 || (bom.tcv_cents ?? 0) !== 0
  )
  const costControlTotalsByProject = await getProjectCostControlTotalsForProjects({
    tenantId,
    projectIds: trackedBomProjects.map(([projectId]) => projectId),
  })

  for (const [projectId, bom] of trackedBomProjects) {
    const controlTotals = costControlTotalsByProject.get(projectId)
    const committed = controlTotals?.committedCents ?? 0
    const actual = controlTotals?.actualCents ?? 0

    // PO committed overrun vs BOM budget (commitment-side signal).
    if (bom.total_cost_cents > 0 && committed > 0) {
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

    // Actual-spend GP erosion (execution-side signal — recorded cost entries).
    if (actual > 0) {
      const snap = computeProjectCostSnapshot({
        budgetCents: bom.total_cost_cents,
        committedCents: committed,
        actualCents: actual,
        bomTcvCents: bom.tcv_cents ?? 0,
        bomGpCents: bom.gp_cents ?? 0,
      })
      if (snap.severity !== 'none') {
        alerts.push({
          type: 'gp_erosion_actual',
          severity: snap.severity === 'danger' ? 'danger' : 'warning',
          label: bom.project_name ?? 'Unknown project',
          detail: `Actual spend eroding GP by ${(snap.gpErosionBps / 100).toFixed(0)}%`,
          href: `/projects/${projectId}/cost`,
        })
      }
    }
  }

  // Sort: danger first, then by type
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'danger' ? -1 : 1
    return 0
  })
}

// -----------------------------------------------------------------------------
// US-004 — Conversion rates between ABI OPS stages.
//
// Rate for pair (A → B) = count(stage at or beyond B) / count(stage at or
// beyond A) * 100. "At or beyond" uses canonical pipeline order so a
// "won" deal counts as having passed every prior stage. Closed-lost rows
// are excluded — the analysis is about progression, not loss attribution.
// -----------------------------------------------------------------------------

export async function getConversionRates(tenantId: string): Promise<ConversionRateRow[]> {
  const rows = await db
    .select({ stage: opportunities.stage, count: count() })
    .from(opportunities)
    .where(eq(opportunities.tenant_id, tenantId))
    .groupBy(opportunities.stage)

  // Map of how many opps are currently sitting AT each stage.
  const atStage = new Map<string, number>()
  for (const r of rows) atStage.set(r.stage, Number(r.count))

  // "At or beyond" count for stage X = sum of counts at X and later.
  const atOrBeyond = new Map<PipelineStage, number>()
  for (let i = 0; i < PIPELINE_STAGES.length; i += 1) {
    const fromStage = PIPELINE_STAGES[i] as PipelineStage
    let acc = 0
    for (let j = i; j < PIPELINE_STAGES.length; j += 1) {
      acc += atStage.get(PIPELINE_STAGES[j] as string) ?? 0
    }
    atOrBeyond.set(fromStage, acc)
  }

  const result: ConversionRateRow[] = []
  for (let i = 0; i < PIPELINE_STAGES.length - 1; i += 1) {
    const fromStage = PIPELINE_STAGES[i] as PipelineStage
    const toStage = PIPELINE_STAGES[i + 1] as PipelineStage
    const fromCount = atOrBeyond.get(fromStage) ?? 0
    const toCount = atOrBeyond.get(toStage) ?? 0
    const ratePct = fromCount > 0 ? Math.round((toCount / fromCount) * 1000) / 10 : 0
    result.push({ fromStage, toStage, fromCount, toCount, ratePct })
  }
  return result
}

// -----------------------------------------------------------------------------
// US-004 — Monthly forecast (weighted_tcv per rep per closing-month).
//
// Buckets weighted pipeline into the next `monthsAhead` months keyed on
// `closing_date`. Closed-won and closed-lost rows are excluded.
// -----------------------------------------------------------------------------

export async function getMonthlyForecast(
  tenantId: string,
  monthsAhead = 6
): Promise<MonthlyForecastData> {
  const now = new Date()
  const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const endMonth = new Date(
    Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + monthsAhead, 1)
  )

  const months: string[] = []
  for (let i = 0; i < monthsAhead; i += 1) {
    const d = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth() + i, 1))
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  const TERMINAL = new Set(['closed_won', 'closed_lost', 'won', 'lost'])
  const rows = await db
    .select({
      repId: opportunities.rep_id,
      stage: opportunities.stage,
      closingDate: opportunities.closing_date,
      weighted: opportunities.weighted_tcv_cents,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenant_id, tenantId),
        gte(opportunities.closing_date, startMonth),
        lt(opportunities.closing_date, endMonth)
      )
    )

  const byRep: Record<string, number[]> = {}
  for (const row of rows) {
    if (!row.closingDate) continue
    if (TERMINAL.has(row.stage)) continue
    const repId = row.repId ?? 'unassigned'
    const d = new Date(row.closingDate)
    const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const idx = months.indexOf(monthKey)
    if (idx < 0) continue
    const series = byRep[repId] ?? new Array<number>(monthsAhead).fill(0)
    series[idx] = (series[idx] ?? 0) + Number(row.weighted ?? 0)
    byRep[repId] = series
  }

  const repIds = Object.keys(byRep).filter((id) => id !== 'unassigned')
  const repLabels: Record<string, string> = {}
  if (repIds.length > 0) {
    const repUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, repIds))
    for (const u of repUsers) repLabels[u.id] = u.email
  }
  if (byRep['unassigned']) repLabels['unassigned'] = 'Unassigned'

  return { months, byRep, repLabels }
}
