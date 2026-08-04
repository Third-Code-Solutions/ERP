import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  projects,
  type Project,
} from '@third-code-erp/database/schema'
import type {
  CreateProjectCommand,
  ProjectCreationResult,
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
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(AuditService)
    private readonly audit: AuditService
  ) {}

  async create(
    command: CreateProjectCommand,
    principal: ErpPrincipal
  ): Promise<ProjectCreationResult> {
    const enabled = this.config.get<boolean>(
      'ERP_PROJECT_CREATE_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_PROJECT_CREATE_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Project creation is not enabled for this tenant; no Project was created.'
      )
    }

    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [created] = await transaction
        .insert(projects)
        .values({
          tenant_id: principal.tenantId,
          created_by: principal.userId,
          name: command.name,
          client: command.client,
          status: command.status,
          project_type: command.projectType,
          total_sqm: command.totalSqm,
          location: command.location,
          notes: command.notes,
        })
        .returning()

      if (!created) throw new ConflictException('Project was not created')
      return this.creationResult(created)
    })
  }

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

  private creationResult(project: Project): ProjectCreationResult {
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
      createdAt: project.created_at.toISOString(),
      updatedAt: project.updated_at.toISOString(),
    }
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
