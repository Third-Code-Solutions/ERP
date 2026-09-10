import {
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  projectBudgets,
  projectScheduleTasks,
  progressUpdates,
  projects,
  supplierBillLines,
  supplierBills,
} from '@third-code-erp/database/schema'
import {
  computeProjectPerformance,
  projectPerformanceQuerySchema,
  type ProjectPerformanceQuery,
  type ProjectPerformanceResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

type ScheduleRow = {
  plannedStart: string
  plannedFinish: string
  plannedLaborMinutes: number
  percentComplete: number
  status: string
}

type ProgressRow = {
  percentByCategory: unknown
  weekEnding: Date
}

type ActualRow = {
  actualCostCents: number | string | null
  evidenceCount: number | string | null
}

const DAY_MS = 86_400_000

function asNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0)
}

function readOverallProgress(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = (value as Record<string, unknown>).overall_pct
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  if (raw < 0 || raw > 100) return null
  return raw
}

function utcDate(value: string): number | null {
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed) ? parsed : null
}

function plannedPercentAt(
  rows: readonly ScheduleRow[],
  asOf: Date,
): number | null {
  const asOfDay = utcDate(asOf.toISOString().slice(0, 10))
  if (asOfDay === null) return null
  let weighted = 0
  let labor = 0
  for (const row of rows) {
    if (row.status === 'cancelled' || row.plannedLaborMinutes <= 0) continue
    const start = utcDate(row.plannedStart)
    const finish = utcDate(row.plannedFinish)
    if (start === null || finish === null || finish < start) continue
    const duration = Math.max(1, Math.round((finish - start) / DAY_MS))
    const elapsed = Math.max(0, Math.min(duration, Math.round((asOfDay - start) / DAY_MS)))
    const percent = Math.max(0, Math.min(100, (elapsed / duration) * 100))
    weighted += row.plannedLaborMinutes * percent
    labor += row.plannedLaborMinutes
  }
  return labor > 0 ? Math.round((weighted / labor) * 100) / 100 : null
}

function actualPercentFromSchedule(rows: readonly ScheduleRow[]): number | null {
  let weighted = 0
  let labor = 0
  for (const row of rows) {
    if (row.status === 'cancelled' || row.plannedLaborMinutes <= 0) continue
    weighted +=
      row.plannedLaborMinutes * Math.max(0, Math.min(100, row.percentComplete))
    labor += row.plannedLaborMinutes
  }
  return labor > 0 ? Math.round((weighted / labor) * 100) / 100 : null
}

@Injectable()
export class ProjectPerformanceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async read(
    projectId: string,
    query: ProjectPerformanceQuery,
    principal: ErpPrincipal,
    now = new Date(),
  ): Promise<ProjectPerformanceResult> {
    projectPerformanceQuerySchema.parse(query)

    const [project] = await this.database.client
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenant_id, principal.tenantId),
          isNull(projects.deleted_at),
        ),
      )
      .limit(1)
    if (!project) throw new NotFoundException('Project not found')

    const [budgetRows, scheduleRows, progressRows, actualRows] =
      await Promise.all([
        this.database.client
          .select({
            totalBudgetCents: projectBudgets.total_budget_cents,
            currency: projectBudgets.currency,
          })
          .from(projectBudgets)
          .where(
            and(
              eq(projectBudgets.tenant_id, principal.tenantId),
              eq(projectBudgets.project_id, projectId),
              eq(projectBudgets.status, 'approved'),
            ),
          )
          .orderBy(desc(projectBudgets.revision))
          .limit(1),
        this.database.client
          .select({
            plannedStart: projectScheduleTasks.planned_start,
            plannedFinish: projectScheduleTasks.planned_finish,
            plannedLaborMinutes: projectScheduleTasks.planned_labor_minutes,
            percentComplete: projectScheduleTasks.percent_complete,
            status: projectScheduleTasks.status,
          })
          .from(projectScheduleTasks)
          .where(
            and(
              eq(projectScheduleTasks.tenant_id, principal.tenantId),
              eq(projectScheduleTasks.project_id, projectId),
              ne(projectScheduleTasks.status, 'cancelled'),
            ),
          ),
        this.database.client
          .select({
            percentByCategory: progressUpdates.percent_by_category,
            weekEnding: progressUpdates.week_ending,
          })
          .from(progressUpdates)
          .where(
            and(
              eq(progressUpdates.tenant_id, principal.tenantId),
              eq(progressUpdates.project_id, projectId),
            ),
          )
          .orderBy(desc(progressUpdates.week_ending))
          .limit(1),
        this.database.client
          .select({
            actualCostCents: sql<number>`coalesce(sum(${supplierBillLines.amount_cents}), 0)::bigint`,
            evidenceCount: sql<number>`count(${supplierBillLines.id})::int`,
          })
          .from(supplierBillLines)
          .innerJoin(
            supplierBills,
            and(
              eq(supplierBills.id, supplierBillLines.supplier_bill_id),
              eq(supplierBills.tenant_id, principal.tenantId),
              eq(supplierBills.project_id, projectId),
            ),
          )
          .where(
            and(
              eq(supplierBillLines.tenant_id, principal.tenantId),
              eq(supplierBillLines.project_id, projectId),
              eq(supplierBills.status, 'posted'),
            ),
          ),
      ])

    const schedule = scheduleRows as ScheduleRow[]
    const latestProgress = progressRows[0] as ProgressRow | undefined
    const weeklyProgress = readOverallProgress(
      latestProgress?.percentByCategory,
    )
    const scheduleProgress = actualPercentFromSchedule(schedule)
    const progressSource =
      weeklyProgress !== null
        ? 'weekly_progress'
        : scheduleProgress !== null
          ? 'normalized_schedule'
          : 'unavailable'
    const actualPercentComplete = weeklyProgress ?? scheduleProgress
    const plannedPercentComplete = plannedPercentAt(schedule, now)
    const actual = actualRows[0] as ActualRow | undefined
    const actualCostCents = Math.max(0, asNumber(actual?.actualCostCents))
    const actualCostEvidenceCount = Math.max(
      0,
      Math.trunc(asNumber(actual?.evidenceCount)),
    )
    const budget = budgetRows[0]

    return computeProjectPerformance({
      projectId,
      asOf: now.toISOString(),
      currency: budget?.currency ?? 'PHP',
      baselineCents:
        budget === undefined ? null : Math.max(0, Number(budget.totalBudgetCents)),
      plannedPercentComplete,
      actualPercentComplete,
      latestProgressWeekEnding:
        weeklyProgress === null || !latestProgress?.weekEnding
          ? null
          : latestProgress.weekEnding.toISOString(),
      progressSource,
      plannedValueSource:
        plannedPercentComplete === null
          ? 'unavailable'
          : 'normalized_schedule_labor',
      actualCostCents,
      actualCostEvidenceCount,
    })
  }
}
