import { and, eq, exists, isNull, type SQL, type SQLWrapper } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { projects } from '@third-code-erp/database/schema'

/**
 * The project exists in this tenant and is not retired. Retirement (the Delete
 * Project command) is a logical delete that hides a project from ordinary
 * operation, so callable server actions treat a retired project as not found,
 * as its pages already do.
 *
 * `lock: 'share'` share-locks the live project row for the rest of the
 * transaction. Retirement updates that row, so a write holding the lock
 * finishes first, and a write that waits on a retirement then sees it retired.
 */
export function liveProjectCondition(
  projectId: string | SQLWrapper,
  tenantId: string,
  options: { lock?: 'share' } = {}
): SQL {
  const live = new QueryBuilder()
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.tenant_id, tenantId),
        isNull(projects.deleted_at)
      )
    )
  return exists(options.lock ? live.for(options.lock) : live)
}
