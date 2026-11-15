import { and, eq, exists, isNull, type SQL, type SQLWrapper } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { projects } from '@third-code-erp/database/schema'

/**
 * The project exists in this tenant and is not retired. Retirement (the Delete
 * Project command) is a logical delete that hides a project from ordinary
 * operation, so callable server actions treat a retired project as not found,
 * as its pages already do.
 */
export function activeProjectCondition(
  projectId: string | SQLWrapper,
  tenantId: string
): SQL {
  return exists(
    new QueryBuilder()
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenant_id, tenantId),
          isNull(projects.deleted_at)
        )
      )
  )
}
