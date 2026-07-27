import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  projects,
  type Project,
} from '@third-code-erp/database/schema'
import type {
  ProjectUpdateResult,
  UpdateProjectCommand,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(AuditService)
    private readonly audit: AuditService
  ) {}

  async update(
    projectId: string,
    command: UpdateProjectCommand,
    principal: ErpPrincipal
  ): Promise<ProjectUpdateResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [existing] = await transaction
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')

      if (!existing) throw new NotFoundException('Project not found')
      if (
        existing.updated_at.toISOString() !==
        new Date(command.expectedUpdatedAt).toISOString()
      ) {
        throw new ConflictException(
          'Project changed after this form was opened'
        )
      }

      const [updated] = await transaction
        .update(projects)
        .set({
          name: command.name,
          client: command.client,
          status: command.status,
          project_type: command.projectType,
          total_sqm: command.totalSqm,
          location: command.location,
          notes: command.notes,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, principal.tenantId)
          )
        )
        .returning()

      if (!updated) throw new NotFoundException('Project not found')
      return this.result(updated)
    })
  }

  private result(project: Project): ProjectUpdateResult {
    return {
      id: project.id,
      tenantId: project.tenant_id,
      name: project.name,
      client: project.client,
      status: project.status,
      projectType: project.project_type,
      totalSqm: project.total_sqm,
      location: project.location,
      notes: project.notes,
      updatedAt: project.updated_at.toISOString(),
    }
  }
}
