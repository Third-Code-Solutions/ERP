import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { projectScheduleTasks, projects, users } from '@third-code-erp/database/schema'
import {
  createProjectScheduleTaskCommandSchema,
  projectScheduleListQuerySchema,
  projectScheduleListResultSchema,
  projectScheduleMutationResultSchema,
  projectScheduleTaskRowSchema,
  projectScheduleTaskStatusCommandSchema,
  projectScheduleCreateResultSchema,
  updateProjectScheduleTaskCommandSchema,
  type CreateProjectScheduleTaskCommand,
  type ProjectScheduleListQuery,
  type ProjectScheduleListResult,
  type ProjectScheduleMutationResult,
  type ProjectScheduleTaskRow,
  type ProjectScheduleTaskStatusCommand,
  type UpdateProjectScheduleTaskCommand,
} from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability, type ErpCapability } from '@third-code-erp/shared-types/authorization'
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const rowSelection = {
  id: projectScheduleTasks.id,
  projectId: projectScheduleTasks.project_id,
  level: projectScheduleTasks.level,
  taskCode: projectScheduleTasks.task_code,
  name: projectScheduleTasks.name,
  description: projectScheduleTasks.description,
  parentTaskId: projectScheduleTasks.parent_task_id,
  predecessorTaskId: projectScheduleTasks.predecessor_task_id,
  plannedStart: projectScheduleTasks.planned_start,
  plannedFinish: projectScheduleTasks.planned_finish,
  actualStart: projectScheduleTasks.actual_start,
  actualFinish: projectScheduleTasks.actual_finish,
  percentComplete: projectScheduleTasks.percent_complete,
  plannedLaborMinutes: projectScheduleTasks.planned_labor_minutes,
  actualLaborMinutes: projectScheduleTasks.actual_labor_minutes,
  status: projectScheduleTasks.status,
  commitmentWeek: projectScheduleTasks.commitment_week,
  commitmentStatus: projectScheduleTasks.commitment_status,
  constraintReason: projectScheduleTasks.constraint_reason,
  ownerId: projectScheduleTasks.owner_id,
  source: projectScheduleTasks.source,
  version: projectScheduleTasks.version,
  createdBy: projectScheduleTasks.created_by,
  createdAt: projectScheduleTasks.created_at,
  updatedAt: projectScheduleTasks.updated_at,
}

type ScheduleTaskDbRow = {
  id: string
  projectId: string
  level: string
  taskCode: string
  name: string
  description: string
  parentTaskId: string | null
  predecessorTaskId: string | null
  plannedStart: string
  plannedFinish: string
  actualStart: string | null
  actualFinish: string | null
  percentComplete: number
  plannedLaborMinutes: number
  actualLaborMinutes: number
  status: string
  commitmentWeek: string | null
  commitmentStatus: string
  constraintReason: string
  ownerId: string | null
  source: string
  version: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

const levelOrder: Record<'l1' | 'l2' | 'l3' | 'l4', number> = { l1: 1, l2: 2, l3: 3, l4: 4 }
const transitions: Record<string, readonly string[]> = {
  planned: ['in_progress', 'blocked', 'cancelled'],
  in_progress: ['planned', 'blocked', 'completed', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

function commandHash(command: CreateProjectScheduleTaskCommand): string {
  return createHash('sha256').update(canonicalJson({ action: 'create', command })).digest('hex')
}

function serialize(row: ScheduleTaskDbRow): ProjectScheduleTaskRow {
  return projectScheduleTaskRowSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function sameEditable(row: ScheduleTaskDbRow, input: UpdateProjectScheduleTaskCommand): boolean {
  return row.level === input.level && row.taskCode === input.taskCode && row.name === input.name && row.description === input.description && row.parentTaskId === input.parentTaskId && row.predecessorTaskId === input.predecessorTaskId && row.plannedStart === input.plannedStart && row.plannedFinish === input.plannedFinish && row.plannedLaborMinutes === input.plannedLaborMinutes && row.ownerId === input.ownerId && row.commitmentWeek === input.commitmentWeek && row.commitmentStatus === input.commitmentStatus && row.constraintReason === input.constraintReason
}

@Injectable()
export class ProjectScheduleService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: ProjectScheduleListQuery, principal: ErpPrincipal): Promise<ProjectScheduleListResult> {
    const filters = projectScheduleListQuerySchema.parse(query)
    await this.requireMembership(principal, 'project.read')
    await this.assertProject(projectId, principal)
    const predicate = and(
      eq(projectScheduleTasks.tenant_id, principal.tenantId),
      eq(projectScheduleTasks.project_id, projectId),
      filters.level ? eq(projectScheduleTasks.level, filters.level) : undefined,
      filters.status ? eq(projectScheduleTasks.status, filters.status) : undefined,
      filters.commitmentStatus ? eq(projectScheduleTasks.commitment_status, filters.commitmentStatus) : undefined,
    )
    const projectPredicate = and(eq(projectScheduleTasks.tenant_id, principal.tenantId), eq(projectScheduleTasks.project_id, projectId))
    const [rows, totals, summaryRows] = await Promise.all([
      this.database.client.select(rowSelection).from(projectScheduleTasks).where(predicate).orderBy(asc(projectScheduleTasks.level), asc(projectScheduleTasks.planned_start), asc(projectScheduleTasks.task_code), asc(projectScheduleTasks.id)).limit(filters.limit).offset((filters.page - 1) * filters.limit),
      this.database.client.select({ total: count() }).from(projectScheduleTasks).where(predicate),
      this.database.client.select({ planned: sql<number>`coalesce(sum(${projectScheduleTasks.planned_labor_minutes}), 0)::int`, actual: sql<number>`coalesce(sum(${projectScheduleTasks.actual_labor_minutes}), 0)::int`, average: sql<number>`coalesce(avg(${projectScheduleTasks.percent_complete}), 0)`, committed: sql<number>`count(*) filter (where ${projectScheduleTasks.commitment_status} = 'committed')::int`, notDone: sql<number>`count(*) filter (where ${projectScheduleTasks.commitment_status} = 'not_done')::int` }).from(projectScheduleTasks).where(projectPredicate),
    ])
    const total = Number(totals[0]?.total ?? 0)
    const summary = summaryRows[0]
    const plannedLaborMinutes = Number(summary?.planned ?? 0)
    const actualLaborMinutes = Number(summary?.actual ?? 0)
    return projectScheduleListResultSchema.parse({
      projectId,
      rows: rows.map((row) => serialize(row as ScheduleTaskDbRow)),
      summary: {
        plannedLaborMinutes,
        actualLaborMinutes,
        laborVarianceMinutes: actualLaborMinutes - plannedLaborMinutes,
        averagePercentComplete: Number(summary?.average ?? 0),
        committedCount: Number(summary?.committed ?? 0),
        notDoneCount: Number(summary?.notDone ?? 0),
      },
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    })
  }

  async create(command: CreateProjectScheduleTaskCommand, principal: ErpPrincipal) {
    const input = createProjectScheduleTaskCommandSchema.parse(command)
    const hash = commandHash(input)
    const result = await this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(transaction, principal, 'project.schedule.manage')
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [project] = await transaction.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenant_id, authorizedPrincipal.tenantId), isNull(projects.deleted_at))).limit(1).for('update')
      if (!project) throw new NotFoundException('Project not found')
      const [replay] = await transaction.select({ ...rowSelection, requestHash: projectScheduleTasks.request_hash }).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.tenant_id, authorizedPrincipal.tenantId), eq(projectScheduleTasks.client_request_id, input.clientRequestId))).limit(1).for('update')
      if (replay) {
        if (replay.requestHash !== hash) throw new ConflictException('Client request id was already used with different schedule data')
        return { projectId: input.projectId, created: false, changed: false, task: serialize(replay as ScheduleTaskDbRow) }
      }
      await this.assertDependencies(transaction, authorizedPrincipal.tenantId, input.projectId, input.level, input.parentTaskId, input.predecessorTaskId)
      await this.assertOwner(transaction, authorizedPrincipal.tenantId, input.ownerId)
      const [duplicate] = await transaction.select({ id: projectScheduleTasks.id }).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.tenant_id, authorizedPrincipal.tenantId), eq(projectScheduleTasks.project_id, input.projectId), eq(projectScheduleTasks.level, input.level), eq(projectScheduleTasks.task_code, input.taskCode))).limit(1)
      if (duplicate) throw new ConflictException('Task code already exists at this schedule level')
      const [created] = await transaction.insert(projectScheduleTasks).values({ tenant_id: authorizedPrincipal.tenantId, project_id: input.projectId, level: input.level, task_code: input.taskCode, name: input.name, description: input.description, parent_task_id: input.parentTaskId, predecessor_task_id: input.predecessorTaskId, planned_start: input.plannedStart, planned_finish: input.plannedFinish, planned_labor_minutes: input.plannedLaborMinutes, owner_id: input.ownerId, commitment_week: input.commitmentWeek, commitment_status: input.commitmentStatus, constraint_reason: input.constraintReason, source: 'manual', client_request_id: input.clientRequestId, request_hash: hash, version: 1, created_by: authorizedPrincipal.userId }).returning(rowSelection)
      if (!created) throw new InternalServerErrorException('Schedule task was not created')
      const task = serialize(created as ScheduleTaskDbRow)
      await this.audit.writeSemantic(transaction, { tenantId: authorizedPrincipal.tenantId, actorId: authorizedPrincipal.userId, entityType: 'project_schedule_task', entityId: task.id, action: 'create', diff: { project_id: input.projectId, level: input.level, task_code: input.taskCode, source: 'manual' } })
      return { projectId: input.projectId, created: true, changed: true, task }
    })
    return projectScheduleCreateResultSchema.parse(result)
  }

  async update(projectId: string, taskId: string, command: UpdateProjectScheduleTaskCommand, principal: ErpPrincipal): Promise<ProjectScheduleMutationResult> {
    const input = updateProjectScheduleTaskCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(transaction, principal, 'project.schedule.manage')
      await this.audit.stampActor(transaction, authorizedPrincipal)
      await this.assertProjectOn(transaction, projectId, authorizedPrincipal.tenantId)
      const [current] = await transaction.select(rowSelection).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.id, taskId), eq(projectScheduleTasks.project_id, projectId), eq(projectScheduleTasks.tenant_id, authorizedPrincipal.tenantId))).limit(1).for('update')
      if (!current) throw new NotFoundException('Project schedule task not found')
      const row = current as ScheduleTaskDbRow
      if (row.version !== input.expectedVersion) throw new ConflictException('Schedule task changed; refresh before editing')
      if (row.status === 'completed' || row.status === 'cancelled') throw new ConflictException('Completed or cancelled schedule tasks cannot be edited')
      if (sameEditable(row, input)) return projectScheduleMutationResultSchema.parse({ projectId, changed: false, task: serialize(row) })
      await this.assertDependencies(transaction, authorizedPrincipal.tenantId, projectId, input.level, input.parentTaskId, input.predecessorTaskId, taskId)
      await this.assertOwner(transaction, authorizedPrincipal.tenantId, input.ownerId)
      const [duplicate] = await transaction.select({ id: projectScheduleTasks.id }).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.tenant_id, authorizedPrincipal.tenantId), eq(projectScheduleTasks.project_id, projectId), eq(projectScheduleTasks.level, input.level), eq(projectScheduleTasks.task_code, input.taskCode))).limit(1)
      if (duplicate && duplicate.id !== taskId) throw new ConflictException('Task code already exists at this schedule level')
      const [updated] = await transaction.update(projectScheduleTasks).set({ level: input.level, task_code: input.taskCode, name: input.name, description: input.description, parent_task_id: input.parentTaskId, predecessor_task_id: input.predecessorTaskId, planned_start: input.plannedStart, planned_finish: input.plannedFinish, planned_labor_minutes: input.plannedLaborMinutes, owner_id: input.ownerId, commitment_week: input.commitmentWeek, commitment_status: input.commitmentStatus, constraint_reason: input.constraintReason, version: row.version + 1, updated_at: new Date() }).where(and(eq(projectScheduleTasks.id, taskId), eq(projectScheduleTasks.project_id, projectId), eq(projectScheduleTasks.tenant_id, authorizedPrincipal.tenantId), eq(projectScheduleTasks.version, row.version))).returning(rowSelection)
      if (!updated) throw new ConflictException('Schedule task changed; refresh before editing')
      const task = serialize(updated as ScheduleTaskDbRow)
      await this.audit.writeSemantic(transaction, { tenantId: authorizedPrincipal.tenantId, actorId: authorizedPrincipal.userId, entityType: 'project_schedule_task', entityId: taskId, action: 'update', diff: { project_id: projectId, from_version: row.version, to_version: task.version, from_level: row.level, to_level: task.level, from_status: row.status, to_status: task.status } })
      return projectScheduleMutationResultSchema.parse({ projectId, changed: true, task })
    })
  }

  async updateStatus(projectId: string, taskId: string, command: ProjectScheduleTaskStatusCommand, principal: ErpPrincipal): Promise<ProjectScheduleMutationResult> {
    const input = projectScheduleTaskStatusCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(transaction, principal, 'project.schedule.manage')
      await this.audit.stampActor(transaction, authorizedPrincipal)
      await this.assertProjectOn(transaction, projectId, authorizedPrincipal.tenantId)
      const [current] = await transaction.select(rowSelection).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.id, taskId), eq(projectScheduleTasks.project_id, projectId), eq(projectScheduleTasks.tenant_id, authorizedPrincipal.tenantId))).limit(1).for('update')
      if (!current) throw new NotFoundException('Project schedule task not found')
      const row = current as ScheduleTaskDbRow
      if (row.version !== input.expectedVersion) throw new ConflictException('Schedule task changed; refresh before updating status')
      if (row.status !== input.status && !(transitions[row.status] ?? []).includes(input.status)) throw new ConflictException(`Cannot transition ${row.status} → ${input.status}`)
      if (row.status === input.status && row.percentComplete === input.percentComplete && row.actualStart === input.actualStart && row.actualFinish === input.actualFinish && row.actualLaborMinutes === input.actualLaborMinutes && row.commitmentWeek === input.commitmentWeek && row.commitmentStatus === input.commitmentStatus && row.constraintReason === input.constraintReason) return projectScheduleMutationResultSchema.parse({ projectId, changed: false, task: serialize(row) })
      const [updated] = await transaction.update(projectScheduleTasks).set({ status: input.status, percent_complete: input.percentComplete, actual_start: input.actualStart, actual_finish: input.actualFinish, actual_labor_minutes: input.actualLaborMinutes, commitment_week: input.commitmentWeek, commitment_status: input.commitmentStatus, constraint_reason: input.constraintReason, version: row.version + 1, updated_at: new Date() }).where(and(eq(projectScheduleTasks.id, taskId), eq(projectScheduleTasks.project_id, projectId), eq(projectScheduleTasks.tenant_id, authorizedPrincipal.tenantId), eq(projectScheduleTasks.version, row.version))).returning(rowSelection)
      if (!updated) throw new ConflictException('Schedule task changed; refresh before updating status')
      const task = serialize(updated as ScheduleTaskDbRow)
      await this.audit.writeSemantic(transaction, { tenantId: authorizedPrincipal.tenantId, actorId: authorizedPrincipal.userId, entityType: 'project_schedule_task', entityId: taskId, action: 'status_change', diff: { project_id: projectId, from_status: row.status, to_status: task.status, from_percent_complete: row.percentComplete, to_percent_complete: task.percentComplete, from_version: row.version, to_version: task.version, commitment_status: task.commitmentStatus } })
      return projectScheduleMutationResultSchema.parse({ projectId, changed: true, task })
    })
  }

  private async assertProject(projectId: string, principal: ErpPrincipal): Promise<void> {
    await this.assertProjectOn(this.database.client, projectId, principal.tenantId)
  }

  private async assertProjectOn(client: DatabaseService['client'] | DatabaseTransaction, projectId: string, tenantId: string): Promise<void> {
    const [project] = await client.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at))).limit(1)
    if (!project) throw new NotFoundException('Project not found')
  }

  private async assertOwner(client: DatabaseService['client'] | DatabaseTransaction, tenantId: string, ownerId: string | null): Promise<void> {
    if (!ownerId) return
    const [owner] = await client.select({ id: users.id }).from(users).where(and(eq(users.id, ownerId), eq(users.tenant_id, tenantId))).limit(1)
    if (!owner) throw new NotFoundException('Schedule owner not found')
  }

  private async assertDependencies(client: DatabaseTransaction, tenantId: string, projectId: string, level: 'l1' | 'l2' | 'l3' | 'l4', parentTaskId: string | null, predecessorTaskId: string | null, selfId?: string): Promise<void> {
    if (parentTaskId) {
      if (parentTaskId === selfId) throw new ConflictException('Schedule task cannot be its own parent')
      const [parent] = await client.select({ id: projectScheduleTasks.id, projectId: projectScheduleTasks.project_id, level: projectScheduleTasks.level }).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.id, parentTaskId), eq(projectScheduleTasks.tenant_id, tenantId))).limit(1)
      if (!parent || parent.projectId !== projectId) throw new NotFoundException('Parent schedule task not found')
      if (levelOrder[parent.level as keyof typeof levelOrder] >= levelOrder[level]) throw new ConflictException('Parent task must be at a higher schedule level')
    }
    if (predecessorTaskId) {
      if (predecessorTaskId === selfId) throw new ConflictException('Schedule task cannot precede itself')
      const [predecessor] = await client.select({ id: projectScheduleTasks.id, projectId: projectScheduleTasks.project_id, level: projectScheduleTasks.level }).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.id, predecessorTaskId), eq(projectScheduleTasks.tenant_id, tenantId))).limit(1)
      if (!predecessor || predecessor.projectId !== projectId || predecessor.level !== level) throw new ConflictException('Predecessor task must be in the same project and level')
    }
  }

  private async requireMembership(principal: ErpPrincipal, capability: ErpCapability): Promise<ErpPrincipal> {
    return this.requireMembershipOn(this.database.client, principal, capability)
  }

  private async requireMembershipOn(client: DatabaseService['client'] | DatabaseTransaction, principal: ErpPrincipal, capability: ErpCapability): Promise<ErpPrincipal> {
    const [membership] = await client.select({ tenantId: users.tenant_id, role: users.role, email: users.email }).from(users).where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))).limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!membership || !role.success || !roleHasCapability(role.data, capability)) throw new ForbiddenException()
    return { userId: principal.userId, tenantId: membership.tenantId, role: role.data, email: membership.email }
  }
}
