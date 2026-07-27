import { db } from '@third-code-erp/database'
import { projects } from '@third-code-erp/database/schema'
import { eq, desc, asc, and, or, ilike, sql, type SQL } from 'drizzle-orm'
import type { Project } from '@third-code-erp/database/schema'

export type { Project }

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
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.tenant_id, tenantId))
    .limit(1)

  if (!row || row.id !== projectId) return null
  return row
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
