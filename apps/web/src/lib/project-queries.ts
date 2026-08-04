import { db } from '@third-code-erp/database'
import {
  dailyTasks,
  deliverySchedules,
  documents,
  projects,
  purchaseOrders,
  punchlistItems,
  progressUpdates,
  variationOrders,
} from '@third-code-erp/database/schema'
import { eq, desc, asc, and, or, ilike, sql, type SQL, count, inArray } from 'drizzle-orm'
import type { Project, ProgressUpdate } from '@third-code-erp/database/schema'
import {
  getProjectThroughCoreApi,
  projectReadsUseCoreApi,
} from './erp-core-client'

export type { Project }

export interface ProjectCommandCenterData {
  pendingTasks: number
  overdueTasks: number
  documents: number
  pendingDecisions: number
  openPunchlist: number
  activeDeliveries: number
  progressPercent: number | null
  progressWeekEnding: string | null
}

function readOverallProgress(value: ProgressUpdate['percent_by_category']): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = (value as Record<string, unknown>).overall_pct
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
  return Math.max(0, Math.min(100, raw))
}

function numeric(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const PROJECT_STATUS_VALUES = ['lead', 'active', 'on_hold', 'completed', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number]

export const PROJECT_TYPE_VALUES = ['mep', 'fit_out', 'interior', 'mixed'] as const
export type ProjectType = (typeof PROJECT_TYPE_VALUES)[number]

export const PROJECT_SORT_VALUES = ['created_at', 'name', 'status'] as const
export type ProjectSort = (typeof PROJECT_SORT_VALUES)[number]

export type ProjectOrder = 'asc' | 'desc'

export const DEFAULT_LIMIT = 20
export const MAX_LIMIT = 100

export interface ProjectFilters {
  q?: string
  status?: ProjectStatus
  type?: ProjectType
  sort?: ProjectSort
  order?: ProjectOrder
  page?: number
  limit?: number
}

export interface FilteredProjectsResult {
  rows: Project[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function getProjects(tenantId: string) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.tenant_id, tenantId))
    .orderBy(desc(projects.created_at))
}

export async function getProject(tenantId: string, projectId: string) {
  if (projectReadsUseCoreApi(tenantId)) {
    const result = await getProjectThroughCoreApi(projectId)
    if (!result.ok || !result.data) {
      throw new Error(result.error ?? 'Project data was not read')
    }
    if (
      result.data.id !== projectId ||
      result.data.tenantId !== tenantId
    ) {
      throw new Error('Project read returned an invalid tenant scope')
    }
    return projectReadResultToRow(result.data)
  }

  return getProjectDirect(tenantId, projectId)
}

async function getProjectDirect(tenantId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.tenant_id, tenantId),
        eq(projects.id, projectId)
      )
    )
    .limit(1)

  return row ?? null
}

export function projectReadResultToRow(
  result: import('@third-code-erp/shared-types').ProjectReadResult
): Project {
  return {
    id: result.id,
    tenant_id: result.tenantId,
    account_id: result.accountId,
    name: result.name,
    client: result.client,
    location: result.location,
    project_type: result.projectType,
    status: result.status,
    total_sqm: result.totalSqm,
    notes: result.notes,
    created_by: result.createdBy,
    created_at: new Date(result.createdAt),
    updated_at: new Date(result.updatedAt),
  }
}

/**
 * Read-only, project-scoped operating signals for Project Command Center.
 * Every query repeats tenant and project ownership predicates; no mutation or
 * Cortex access happens here.
 */
export async function getProjectCommandCenter(
  tenantId: string,
  projectId: string,
  now = new Date(),
): Promise<ProjectCommandCenterData> {
  const [taskRow, documentRow, decisionRow, punchlistRow, deliveryRow, progressRow] =
    await Promise.all([
      db
        .select({
          pending: count(),
          overdue: sql<number>`count(*) filter (where ${dailyTasks.due_date} < ${now.toISOString()})`,
        })
        .from(dailyTasks)
        .where(
          and(
            eq(dailyTasks.tenant_id, tenantId),
            eq(dailyTasks.project_id, projectId),
            eq(dailyTasks.status, 'pending'),
          ),
        ),
      db
        .select({ total: count() })
        .from(documents)
        .where(and(eq(documents.tenant_id, tenantId), eq(documents.project_id, projectId))),
      db
        .select({ total: count() })
        .from(variationOrders)
        .where(
          and(
            eq(variationOrders.tenant_id, tenantId),
            eq(variationOrders.project_id, projectId),
            inArray(variationOrders.status, [
              'draft',
              'pending_commercial_pricing',
              'pending_client_signature',
            ]),
          ),
        ),
      db
        .select({ total: count() })
        .from(punchlistItems)
        .where(
          and(
            eq(punchlistItems.tenant_id, tenantId),
            eq(punchlistItems.project_id, projectId),
            inArray(punchlistItems.status, ['open', 'in_progress', 'for_inspection']),
          ),
        ),
      db
        .select({ total: count() })
        .from(deliverySchedules)
        .innerJoin(
          purchaseOrders,
          and(
            eq(purchaseOrders.id, deliverySchedules.purchase_order_id),
            eq(purchaseOrders.tenant_id, tenantId),
            eq(purchaseOrders.project_id, projectId),
          ),
        )
        .where(
          and(
            eq(deliverySchedules.tenant_id, tenantId),
            inArray(deliverySchedules.status, [
              'scheduled',
              'site_preparing',
              'site_ready',
              'in_transit',
              'received',
              'inspecting',
            ]),
          ),
        ),
      db
        .select({ percentByCategory: progressUpdates.percent_by_category, weekEnding: progressUpdates.week_ending })
        .from(progressUpdates)
        .where(and(eq(progressUpdates.tenant_id, tenantId), eq(progressUpdates.project_id, projectId)))
        .orderBy(desc(progressUpdates.week_ending))
        .limit(1),
    ])

  const latestProgress = progressRow[0]
  return {
    pendingTasks: numeric(taskRow[0]?.pending),
    overdueTasks: numeric(taskRow[0]?.overdue),
    documents: numeric(documentRow[0]?.total),
    pendingDecisions: numeric(decisionRow[0]?.total),
    openPunchlist: numeric(punchlistRow[0]?.total),
    activeDeliveries: numeric(deliveryRow[0]?.total),
    progressPercent: latestProgress ? readOverallProgress(latestProgress.percentByCategory) : null,
    progressWeekEnding: latestProgress?.weekEnding?.toISOString() ?? null,
  }
}

export async function getProjectsFiltered(
  tenantId: string,
  filters: ProjectFilters
): Promise<FilteredProjectsResult> {
  const sort: ProjectSort = filters.sort ?? 'created_at'
  const order: ProjectOrder = filters.order ?? 'desc'
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT))
  const offset = (page - 1) * limit

  const conditions: SQL[] = [eq(projects.tenant_id, tenantId)]

  if (filters.q && filters.q.trim().length > 0) {
    const term = `%${filters.q.trim()}%`
    const search = or(ilike(projects.name, term), ilike(projects.client, term))
    if (search) conditions.push(search)
  }

  if (filters.status) {
    conditions.push(eq(projects.status, filters.status))
  }

  if (filters.type) {
    conditions.push(eq(projects.project_type, filters.type))
  }

  const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

  const sortColumn =
    sort === 'name'
      ? projects.name
      : sort === 'status'
        ? projects.status
        : projects.created_at

  const orderClause = order === 'asc' ? asc(sortColumn) : desc(sortColumn)

  const rowsPromise = db
    .select()
    .from(projects)
    .where(whereClause)
    .orderBy(orderClause)
    .limit(limit)
    .offset(offset)

  const countPromise = db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(whereClause)

  const [rows, countRows] = await Promise.all([rowsPromise, countPromise])
  const total = countRows[0]?.count ?? 0
  const totalPages = total === 0 ? 1 : Math.ceil(total / limit)

  return { rows, total, page, limit, totalPages }
}
