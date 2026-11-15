import { and, eq, exists, isNull, type SQL, type SQLWrapper } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { projects } from '../schema'

/**
 * The project exists in this tenant and is not retired. Retirement (the Delete
 * Project command) is a logical delete that hides a project from ordinary
 * operation, so callable actions and commands treat a retired project as not
 * found, as its pages already do.
 *
 * It does not lock the project row. Writers that take the tenant audit lock
 * before updating a project (signing, award, opportunity conversion) would
 * deadlock against a BOM write holding a project lock while it audits.
 * shortcut: a write already past this check can still commit just after a
 * concurrent retirement; revisit if the repo settles one lock order.
 */
export function liveProjectCondition(
  projectId: string | SQLWrapper,
  tenantId: string | SQLWrapper
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
