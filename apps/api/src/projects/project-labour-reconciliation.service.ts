import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { projectScheduleTasks, projects, users } from '@third-code-erp/database/schema'
import {
  buildProjectLabourReconciliationResult,
  projectLabourReconciliationQuerySchema,
  type ProjectLabourReconciliationQuery,
  type ProjectLabourReconciliationResult,
  type ProjectLabourReconciliationTask,
} from '@third-code-erp/shared-types'
import {
  ERP_ROLES,
  roleHasCapability,
  type ErpCapability,
} from '@third-code-erp/shared-types/authorization'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class ProjectLabourReconciliationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async read(
    projectId: string,
    query: ProjectLabourReconciliationQuery,
    principal: ErpPrincipal,
    now = new Date(),
  ): Promise<ProjectLabourReconciliationResult> {
    projectLabourReconciliationQuerySchema.parse(query)
    await this.requireMembership(principal, 'project.read')

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

    const rows = await this.database.client
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
          eq(projectScheduleTasks.tenant_id, principal.tenantId),
          eq(projectScheduleTasks.project_id, projectId),
          ne(projectScheduleTasks.status, 'cancelled'),
        ),
      )

    return buildProjectLabourReconciliationResult(
      projectId,
      now.toISOString(),
      rows as ProjectLabourReconciliationTask[],
    )
  }

  private async requireMembership(
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<void> {
    const [membership] = await this.database.client
      .select({ tenantId: users.tenant_id, role: users.role, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId),
        ),
      )
      .limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!role.success || !roleHasCapability(role.data, capability)) {
      throw new ForbiddenException()
    }
  }
}
