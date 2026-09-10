import 'server-only'

import { db } from '@third-code-erp/database'
import { projectScheduleTasks, projects } from '@third-code-erp/database/schema'
import {
  buildProjectLabourReconciliationResult,
  projectLabourReconciliationQuerySchema,
  type ProjectLabourReconciliationQuery,
  type ProjectLabourReconciliationResult,
  type ProjectLabourReconciliationTask,
} from '@third-code-erp/shared-types'
import { and, eq, isNull, ne } from 'drizzle-orm'

export async function readProjectLabourReconciliationForTenant(
  tenantId: string,
  projectId: string,
  query: ProjectLabourReconciliationQuery,
  now = new Date(),
): Promise<ProjectLabourReconciliationResult> {
  projectLabourReconciliationQuerySchema.parse(query)
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.tenant_id, tenantId),
        isNull(projects.deleted_at),
      ),
    )
    .limit(1)
  if (!project) throw new Error('Project not found')

  const tasks = await db
    .select({
      taskId: projectScheduleTasks.id,
      level: projectScheduleTasks.level,
      taskCode: projectScheduleTasks.task_code,
      name: projectScheduleTasks.name,
      taskStatus: projectScheduleTasks.status,
      plannedLaborMinutes: projectScheduleTasks.planned_labor_minutes,
      actualLaborMinutes: projectScheduleTasks.actual_labor_minutes,
    })
    .from(projectScheduleTasks)
    .where(
      and(
        eq(projectScheduleTasks.tenant_id, tenantId),
        eq(projectScheduleTasks.project_id, projectId),
        ne(projectScheduleTasks.status, 'cancelled'),
      ),
    )

  return buildProjectLabourReconciliationResult(
    projectId,
    now.toISOString(),
    tasks as ProjectLabourReconciliationTask[],
  )
}
