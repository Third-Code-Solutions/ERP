import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  dailyTasks,
  deliverySchedules,
  documents,
  progressUpdates,
  projects,
  purchaseOrders,
  punchlistItems,
  variationOrders,
} from '@third-code-erp/database/schema'
import {
  projectCommandCenterQuerySchema,
  projectCommandCenterResultSchema,
  type ProjectCommandCenterQuery,
  type ProjectCommandCenterResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

function readOverallProgress(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = (value as Record<string, unknown>).overall_pct
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.max(0, Math.min(100, raw))
}

@Injectable()
export class ProjectCommandCenterService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async read(
    projectId: string,
    query: ProjectCommandCenterQuery,
    principal: ErpPrincipal,
    now = new Date()
  ): Promise<ProjectCommandCenterResult> {
    projectCommandCenterQuerySchema.parse(query)

    const [project] = await this.database.client
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenant_id, principal.tenantId),
          isNull(projects.deleted_at)
        )
      )
      .limit(1)
    if (!project) throw new NotFoundException('Project not found')

    const taskScope = [
      eq(dailyTasks.tenant_id, principal.tenantId),
      eq(dailyTasks.project_id, projectId),
    ] as const
    const [taskRow, documentRow, decisionRow, punchlistRow, deliveryRow, progressRow] =
      await Promise.all([
        this.database.client
          .select({
            pending: sql<number>`count(*)::int`,
            overdue: sql<number>`count(*) filter (where ${dailyTasks.due_date} < ${now.toISOString()})::int`,
          })
          .from(dailyTasks)
          .where(and(...taskScope, eq(dailyTasks.status, 'pending'))),
        this.database.client
          .select({ total: sql<number>`count(*)::int` })
          .from(documents)
          .where(
            and(
              eq(documents.tenant_id, principal.tenantId),
              eq(documents.project_id, projectId)
            )
          ),
        this.database.client
          .select({ total: sql<number>`count(*)::int` })
          .from(variationOrders)
          .where(
            and(
              eq(variationOrders.tenant_id, principal.tenantId),
              eq(variationOrders.project_id, projectId),
              inArray(variationOrders.status, [
                'draft',
                'pending_commercial_pricing',
                'pending_client_signature',
              ])
            )
          ),
        this.database.client
          .select({ total: sql<number>`count(*)::int` })
          .from(punchlistItems)
          .where(
            and(
              eq(punchlistItems.tenant_id, principal.tenantId),
              eq(punchlistItems.project_id, projectId),
              inArray(punchlistItems.status, [
                'open',
                'in_progress',
                'for_inspection',
              ])
            )
          ),
        this.database.client
          .select({ total: sql<number>`count(*)::int` })
          .from(deliverySchedules)
          .innerJoin(
            purchaseOrders,
            and(
              eq(purchaseOrders.id, deliverySchedules.purchase_order_id),
              eq(purchaseOrders.tenant_id, principal.tenantId),
              eq(purchaseOrders.project_id, projectId)
            )
          )
          .where(
            and(
              eq(deliverySchedules.tenant_id, principal.tenantId),
              inArray(deliverySchedules.status, [
                'scheduled',
                'site_preparing',
                'site_ready',
                'in_transit',
                'received',
                'inspecting',
              ])
            )
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
              eq(progressUpdates.project_id, projectId)
            )
          )
          .orderBy(desc(progressUpdates.week_ending))
          .limit(1),
      ])

    const latestProgress = progressRow[0]
    return projectCommandCenterResultSchema.parse({
      tenantId: principal.tenantId,
      projectId,
      pendingTasks: Number(taskRow[0]?.pending ?? 0),
      overdueTasks: Number(taskRow[0]?.overdue ?? 0),
      documents: Number(documentRow[0]?.total ?? 0),
      pendingDecisions: Number(decisionRow[0]?.total ?? 0),
      openPunchlist: Number(punchlistRow[0]?.total ?? 0),
      activeDeliveries: Number(deliveryRow[0]?.total ?? 0),
      progressPercent: readOverallProgress(latestProgress?.percentByCategory),
      progressWeekEnding: latestProgress?.weekEnding?.toISOString() ?? null,
    })
  }
}
