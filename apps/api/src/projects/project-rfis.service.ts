import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  projectRfis,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  createProjectRfiCommandSchema,
  projectRfiAnswerCommandSchema,
  projectRfiCloseCommandSchema,
  projectRfiCreateResultSchema,
  projectRfiListQuerySchema,
  projectRfiListResultSchema,
  projectRfiRowSchema,
  projectRfiTransitionResultSchema,
  type CreateProjectRfiCommand,
  type ProjectRfiAnswerCommand,
  type ProjectRfiCloseCommand,
  type ProjectRfiCreateResult,
  type ProjectRfiListQuery,
  type ProjectRfiListResult,
  type ProjectRfiRow,
  type ProjectRfiTransitionResult,
} from '@third-code-erp/shared-types'
import {
  ERP_ROLES,
  roleHasCapability,
  type ErpCapability,
} from '@third-code-erp/shared-types/authorization'
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const rowSelection = {
  id: projectRfis.id,
  projectId: projectRfis.project_id,
  rfiNumber: projectRfis.rfi_number,
  subject: projectRfis.subject,
  question: projectRfis.question,
  priority: projectRfis.priority,
  status: projectRfis.status,
  requestedBy: projectRfis.requested_by,
  assignedTo: projectRfis.assigned_to,
  dueAt: projectRfis.due_at,
  response: projectRfis.response,
  respondedAt: projectRfis.responded_at,
  respondedBy: projectRfis.responded_by,
  closedAt: projectRfis.closed_at,
  closedBy: projectRfis.closed_by,
  version: projectRfis.version,
  createdAt: projectRfis.created_at,
  updatedAt: projectRfis.updated_at,
}

type ProjectRfiDbRow = {
  id: string
  projectId: string
  rfiNumber: string
  subject: string
  question: string
  priority: string
  status: string
  requestedBy: string
  assignedTo: string | null
  dueAt: Date | null
  response: string | null
  respondedAt: Date | null
  respondedBy: string | null
  closedAt: Date | null
  closedBy: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}

function serialize(row: ProjectRfiDbRow): ProjectRfiRow {
  return projectRfiRowSchema.parse({
    ...row,
    dueAt: row.dueAt?.toISOString() ?? null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function dateValue(value: string | null): Date | null {
  return value === null ? null : new Date(value)
}

function sameNullableDate(left: Date | null, right: Date | null): boolean {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null)
}

@Injectable()
export class ProjectRfisService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    query: ProjectRfiListQuery,
    principal: ErpPrincipal,
  ): Promise<ProjectRfiListResult> {
    const filters = projectRfiListQuerySchema.parse(query)
    await this.requireMembership(principal, 'project.rfi.read')
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

    const predicate = and(
      eq(projectRfis.tenant_id, principal.tenantId),
      eq(projectRfis.project_id, projectId),
      filters.status ? eq(projectRfis.status, filters.status) : undefined,
      filters.priority ? eq(projectRfis.priority, filters.priority) : undefined,
    )
    const [rows, totals] = await Promise.all([
      this.database.client
        .select(rowSelection)
        .from(projectRfis)
        .where(predicate)
        .orderBy(asc(projectRfis.due_at), desc(projectRfis.created_at), asc(projectRfis.id))
        .limit(filters.limit)
        .offset((filters.page - 1) * filters.limit),
      this.database.client
        .select({ total: count() })
        .from(projectRfis)
        .where(predicate),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return projectRfiListResultSchema.parse({
      projectId,
      rows: rows.map((row) => serialize(row as ProjectRfiDbRow)),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    })
  }

  async create(
    command: CreateProjectRfiCommand,
    principal: ErpPrincipal,
  ): Promise<ProjectRfiCreateResult> {
    const input = createProjectRfiCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'project.rfi.manage',
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId),
            isNull(projects.deleted_at),
          ),
        )
        .limit(1)
        .for('update')
      if (!project) throw new NotFoundException('Project not found')

      if (input.assignedTo) {
        const [assignee] = await transaction
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, input.assignedTo),
              eq(users.tenant_id, authorizedPrincipal.tenantId),
            ),
          )
          .limit(1)
        if (!assignee) throw new NotFoundException('Assigned user not found')
      }

      const [existing] = await transaction
        .select(rowSelection)
        .from(projectRfis)
        .where(
          and(
            eq(projectRfis.tenant_id, authorizedPrincipal.tenantId),
            eq(projectRfis.client_request_id, input.clientRequestId),
          ),
        )
        .limit(1)
        .for('update')
      if (existing) {
        const row = existing as ProjectRfiDbRow
        const sameCommand =
          row.projectId === input.projectId &&
          row.subject === input.subject &&
          row.question === input.question &&
          row.priority === input.priority &&
          row.assignedTo === input.assignedTo &&
          sameNullableDate(row.dueAt, dateValue(input.dueAt))
        if (!sameCommand) {
          throw new ConflictException('Client request id was already used with a different RFI')
        }
        return projectRfiCreateResultSchema.parse({
          projectId: input.projectId,
          created: false,
          rfi: serialize(row),
        })
      }

      const [countRow] = await transaction
        .select({ total: count() })
        .from(projectRfis)
        .where(
          and(
            eq(projectRfis.tenant_id, authorizedPrincipal.tenantId),
            eq(projectRfis.project_id, input.projectId),
          ),
        )
      const rfiNumber = `RFI-${String(Number(countRow?.total ?? 0) + 1).padStart(4, '0')}`
      const [created] = await transaction
        .insert(projectRfis)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: input.projectId,
          rfi_number: rfiNumber,
          subject: input.subject,
          question: input.question,
          priority: input.priority,
          requested_by: authorizedPrincipal.userId,
          assigned_to: input.assignedTo,
          due_at: dateValue(input.dueAt),
          client_request_id: input.clientRequestId,
          version: 1,
        })
        .returning(rowSelection)
      if (!created) throw new InternalServerErrorException('RFI insert returned no record')

      const row = serialize(created as ProjectRfiDbRow)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_rfi',
        entityId: row.id,
        action: 'create',
        diff: {
          project_id: input.projectId,
          rfi_number: row.rfiNumber,
          priority: row.priority,
          assigned_to: row.assignedTo,
        },
      })
      return projectRfiCreateResultSchema.parse({
        projectId: input.projectId,
        created: true,
        rfi: row,
      })
    })
  }

  answer(
    projectId: string,
    rfiId: string,
    command: ProjectRfiAnswerCommand,
    principal: ErpPrincipal,
  ): Promise<ProjectRfiTransitionResult> {
    return this.transition(projectId, rfiId, 'answer', command, principal)
  }

  close(
    projectId: string,
    rfiId: string,
    command: ProjectRfiCloseCommand,
    principal: ErpPrincipal,
  ): Promise<ProjectRfiTransitionResult> {
    return this.transition(projectId, rfiId, 'close', command, principal)
  }

  reopen(
    projectId: string,
    rfiId: string,
    command: ProjectRfiCloseCommand,
    principal: ErpPrincipal,
  ): Promise<ProjectRfiTransitionResult> {
    return this.transition(projectId, rfiId, 'reopen', command, principal)
  }

  private async transition(
    projectId: string,
    rfiId: string,
    target: 'answer' | 'close' | 'reopen',
    command: ProjectRfiAnswerCommand | ProjectRfiCloseCommand,
    principal: ErpPrincipal,
  ): Promise<ProjectRfiTransitionResult> {
    const answerInput = target === 'answer'
      ? projectRfiAnswerCommandSchema.parse(command)
      : null
    const closeInput = target === 'answer'
      ? null
      : projectRfiCloseCommandSchema.parse(command)
    const expectedVersion = answerInput?.expectedVersion ?? closeInput?.expectedVersion ?? 0
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'project.rfi.manage',
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId),
            isNull(projects.deleted_at),
          ),
        )
        .limit(1)
        .for('share')
      if (!project) throw new NotFoundException('Project not found')

      const [current] = await transaction
        .select(rowSelection)
        .from(projectRfis)
        .where(
          and(
            eq(projectRfis.id, rfiId),
            eq(projectRfis.project_id, projectId),
            eq(projectRfis.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .limit(1)
        .for('update')
      if (!current) throw new NotFoundException('Project RFI not found')

      const row = current as ProjectRfiDbRow
      if (row.version !== expectedVersion) {
        throw new ConflictException('RFI changed; refresh before trying again')
      }
      const before = serialize(row)

      if (target === 'answer' && row.status === 'closed') {
        throw new ConflictException('Closed RFIs must be reopened before answering')
      }
      if (target === 'answer' && answerInput && row.status === 'answered' && row.response === answerInput.response) {
        return projectRfiTransitionResultSchema.parse({ projectId, changed: false, rfi: before })
      }
      if (target === 'close' && row.status === 'closed') {
        return projectRfiTransitionResultSchema.parse({ projectId, changed: false, rfi: before })
      }
      if (target === 'reopen' && row.status === 'open') {
        return projectRfiTransitionResultSchema.parse({ projectId, changed: false, rfi: before })
      }

      const now = new Date()
      const update: {
        status: 'open' | 'answered' | 'closed'
        response?: string | null
        responded_at?: Date | null
        responded_by?: string | null
        closed_at?: Date | null
        closed_by?: string | null
      } = target === 'answer'
        ? {
            status: 'answered' as const,
            response: answerInput?.response ?? null,
            responded_at: now,
            responded_by: authorizedPrincipal.userId,
            closed_at: null,
            closed_by: null,
          }
        : target === 'close'
          ? {
              status: 'closed' as const,
              closed_at: now,
              closed_by: authorizedPrincipal.userId,
            }
          : {
              status: 'open' as const,
              response: null,
              responded_at: null,
              responded_by: null,
              closed_at: null,
              closed_by: null,
            }
      const [updated] = await transaction
        .update(projectRfis)
        .set({ ...update, version: row.version + 1, updated_at: now })
        .where(
          and(
            eq(projectRfis.id, rfiId),
            eq(projectRfis.project_id, projectId),
            eq(projectRfis.tenant_id, authorizedPrincipal.tenantId),
            eq(projectRfis.version, row.version),
          ),
        )
        .returning(rowSelection)
      if (!updated) throw new ConflictException('RFI changed; refresh before trying again')

      const after = serialize(updated as ProjectRfiDbRow)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_rfi',
        entityId: rfiId,
        action: 'status_change',
        diff: {
          project_id: projectId,
          from: before.status,
          to: after.status,
          from_version: before.version,
          to_version: after.version,
          reason: target === 'answer' ? 'Response submitted' : closeInput?.reason ?? '',
          response_length: target === 'answer' ? answerInput?.response.length ?? 0 : undefined,
        },
      })
      return projectRfiTransitionResultSchema.parse({ projectId, changed: true, rfi: after })
    })
  }

  private async requireMembership(
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<ErpPrincipal> {
    return this.requireMembershipOn(this.database.client, principal, capability)
  }

  private async requireMembershipOn(
    client: DatabaseService['client'] | DatabaseTransaction,
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<ErpPrincipal> {
    const [membership] = await client
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId)))
      .limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!membership || !role.success || !roleHasCapability(role.data, capability)) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role: role.data,
      email: membership.email,
    }
  }
}
