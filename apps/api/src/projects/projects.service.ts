import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  projectCreateRequests,
  projects,
  users,
  type Project,
} from '@third-code-erp/database/schema'
import {
  createProjectCommandSchema,
  projectCreationResultSchema,
  projectListResultSchema,
  projectReadResultSchema,
  projectUpdateResultSchema,
  type CreateProjectCommand,
  type ProjectListQuery,
  type ProjectListResult,
  type ProjectCreationResult,
  type ProjectReadResult,
  type ProjectUpdateResult,
  type UpdateProjectCommand,
} from '@third-code-erp/shared-types'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

type ProjectCreateRequestRecord = {
  id: string
  requestHash: string
  state: 'processing' | 'succeeded'
  result: unknown
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function commandHash(command: CreateProjectCommand): string {
  return createHash('sha256')
    .update(canonicalJson(command))
    .digest('hex')
}

function validateIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? ''
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function replayResult(value: unknown): ProjectCreationResult {
  const parsed = projectCreationResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Project creation idempotency result is invalid'
    )
  }
  return parsed.data
}

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

  async read(
    projectId: string,
    principal: ErpPrincipal
  ): Promise<ProjectReadResult> {
    const [project] = await this.database.client
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenant_id, principal.tenantId)
        )
      )
      .limit(1)

    if (!project) throw new NotFoundException('Project not found')
    return this.readResult(project)
  }

  async list(
    query: ProjectListQuery,
    principal: ErpPrincipal
  ): Promise<ProjectListResult> {
    const conditions = [eq(projects.tenant_id, principal.tenantId)]

    if (query.q) {
      const term = `%${query.q}%`
      const search = or(
        ilike(projects.name, term),
        ilike(projects.client, term)
      )
      if (search) conditions.push(search)
    }
    if (query.status) conditions.push(eq(projects.status, query.status))
    if (query.projectType) {
      conditions.push(eq(projects.project_type, query.projectType))
    }

    const whereClause =
      conditions.length === 1 ? conditions[0] : and(...conditions)
    const sortColumn =
      query.sort === 'name'
        ? projects.name
        : query.sort === 'status'
          ? projects.status
          : projects.created_at
    const orderClause = query.order === 'asc' ? asc(sortColumn) : desc(sortColumn)
    const offset = (query.page - 1) * query.limit

    const [rows, countRows] = await Promise.all([
      this.database.client
        .select()
        .from(projects)
        .where(whereClause)
        .orderBy(orderClause)
        .limit(query.limit)
        .offset(offset),
      this.database.client
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(whereClause),
    ])

    const total = Number(countRows[0]?.count ?? 0)
    const totalPages = total === 0 ? 1 : Math.ceil(total / query.limit)
    return projectListResultSchema.parse({
      rows: rows.map((project) => this.readResult(project)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    })
  }

  async create(
    command: CreateProjectCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string | undefined
  ): Promise<ProjectCreationResult> {
    const parsedCommand = createProjectCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
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
    const requestHash = commandHash(parsedCommand)

    return this.database.client.transaction(async (transaction) => {
      const membership = await this.lockMembership(transaction, principal)
      if (
        !membership ||
        !roleHasCapability(membership.role, 'project.create')
      ) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role: membership.role,
        email: membership.email,
      }

      await this.audit.stampActor(transaction, authorizedPrincipal)
      const request = await this.claimRequest(
        transaction,
        authorizedPrincipal,
        idempotencyKey,
        requestHash
      )
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Project creation idempotency record has an unsupported state'
        )
      }

      const [created] = await transaction
        .insert(projects)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          created_by: authorizedPrincipal.userId,
          name: parsedCommand.name,
          client: parsedCommand.client,
          status: parsedCommand.status,
          project_type: parsedCommand.projectType,
          total_sqm: parsedCommand.totalSqm,
          location: parsedCommand.location,
          notes: parsedCommand.notes,
        })
        .returning()

      if (!created) throw new ConflictException('Project was not created')
      const result = this.creationResult(created)
      await this.completeRequest(transaction, request.id, result)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project',
        entityId: created.id,
        action: 'create',
        diff: {
          status: parsedCommand.status,
          project_type: parsedCommand.projectType,
          idempotency_key_hash: requestHash,
        },
      })
      return result
    })
  }

  private async lockMembership(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<{ tenantId: string; role: ErpRole; email: string } | undefined> {
    const [membership] = await transaction
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    if (!membership) return undefined
    return {
      tenantId: membership.tenantId,
      role: membership.role as ErpRole,
      email: membership.email,
    }
  }

  private async claimRequest(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
    idempotencyKey: string,
    requestHash: string
  ): Promise<ProjectCreateRequestRecord> {
    await transaction
      .insert(projectCreateRequests)
      .values({
        tenant_id: principal.tenantId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        created_by: principal.userId,
      })
      .onConflictDoNothing({
        target: [
          projectCreateRequests.tenant_id,
          projectCreateRequests.idempotency_key,
        ],
      })

    const [request] = await transaction
      .select({
        id: projectCreateRequests.id,
        requestHash: projectCreateRequests.request_hash,
        state: projectCreateRequests.state,
        result: projectCreateRequests.result,
      })
      .from(projectCreateRequests)
      .where(
        and(
          eq(projectCreateRequests.tenant_id, principal.tenantId),
          eq(projectCreateRequests.idempotency_key, idempotencyKey)
        )
      )
      .limit(1)
      .for('update')

    if (!request) {
      throw new InternalServerErrorException(
        'Project creation idempotency record was not created'
      )
    }
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency key was already used with a different Project command'
      )
    }
    return request
  }

  private async completeRequest(
    transaction: DatabaseTransaction,
    requestId: string,
    result: ProjectCreationResult
  ): Promise<void> {
    const [completed] = await transaction
      .update(projectCreateRequests)
      .set({
        state: 'succeeded',
        project_id: result.id,
        result,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(projectCreateRequests.id, requestId),
          eq(projectCreateRequests.state, 'processing')
        )
      )
      .returning({ id: projectCreateRequests.id })
    if (!completed) {
      throw new InternalServerErrorException(
        'Project creation idempotency record changed before completion'
      )
    }
  }

  async update(
    projectId: string,
    command: UpdateProjectCommand,
    principal: ErpPrincipal
  ): Promise<ProjectUpdateResult> {
    return this.database.client.transaction(async (transaction) => {
      const membership = await this.lockMembership(transaction, principal)
      if (
        !membership ||
        !roleHasCapability(membership.role, 'project.update')
      ) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role: membership.role,
        email: membership.email,
      }

      await this.audit.stampActor(transaction, authorizedPrincipal)

      const [existing] = await transaction
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId)
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
            eq(projects.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .returning()

      if (!updated) throw new NotFoundException('Project not found')
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project',
        entityId: updated.id,
        action: 'update',
        diff: {
          before: {
            name: existing.name,
            client: existing.client,
            status: existing.status,
            project_type: existing.project_type,
            total_sqm: existing.total_sqm,
            location: existing.location,
            notes: existing.notes,
          },
          after: {
            name: updated.name,
            client: updated.client,
            status: updated.status,
            project_type: updated.project_type,
            total_sqm: updated.total_sqm,
            location: updated.location,
            notes: updated.notes,
          },
        },
      })
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

  private readResult(project: Project): ProjectReadResult {
    const result = {
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
      accountId: project.account_id,
      createdBy: project.created_by,
    }
    return projectReadResultSchema.parse(result)
  }

  private result(project: Project): ProjectUpdateResult {
    return projectUpdateResultSchema.parse({
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
    })
  }
}
