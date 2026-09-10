import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  progressUpdates,
  projectWeeklyProgress,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  createProjectWeeklyProgressCommandSchema,
  lockProjectWeeklyProgressCommandSchema,
  projectWeeklyProgressListQuerySchema,
  projectWeeklyProgressListResultSchema,
  projectWeeklyProgressLockResultSchema,
  projectWeeklyProgressMutationResultSchema,
  projectWeeklyProgressPercentSchema,
  projectWeeklyProgressRowSchema,
  weeklyProgressCutoffAt,
  type CreateProjectWeeklyProgressCommand,
  type LockProjectWeeklyProgressCommand,
  type ProjectWeeklyProgressListQuery,
  type ProjectWeeklyProgressListResult,
  type ProjectWeeklyProgressLockResult,
  type ProjectWeeklyProgressMutationResult,
  type ProjectWeeklyProgressPercent,
  type ProjectWeeklyProgressRow,
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
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

const rowSelection = {
  id: projectWeeklyProgress.id,
  projectId: projectWeeklyProgress.project_id,
  progressUpdateId: projectWeeklyProgress.progress_update_id,
  clientRequestId: projectWeeklyProgress.client_request_id,
  requestHash: projectWeeklyProgress.request_hash,
  weekEnding: projectWeeklyProgress.week_ending,
  cutoffAt: projectWeeklyProgress.cutoff_at,
  status: projectWeeklyProgress.status,
  warSnapshot: projectWeeklyProgress.war_snapshot,
  lockedAt: projectWeeklyProgress.locked_at,
  lockedBy: projectWeeklyProgress.locked_by,
  lockReason: projectWeeklyProgress.lock_reason,
  version: projectWeeklyProgress.version,
  createdBy: projectWeeklyProgress.created_by,
  createdAt: projectWeeklyProgress.created_at,
  updatedAt: projectWeeklyProgress.updated_at,
  percentByCategory: progressUpdates.percent_by_category,
  notes: progressUpdates.notes,
}

type DbRow = {
  id: string
  projectId: string
  progressUpdateId: string
  clientRequestId: string
  requestHash: string
  weekEnding: string
  cutoffAt: Date
  status: 'open' | 'locked'
  warSnapshot: unknown
  lockedAt: Date | null
  lockedBy: string | null
  lockReason: string
  version: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
  percentByCategory: unknown
  notes: string | null
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

function commandHash(command: CreateProjectWeeklyProgressCommand): string {
  return createHash('sha256').update(canonicalJson(command)).digest('hex')
}

function percent(value: unknown): ProjectWeeklyProgressPercent {
  const parsed = projectWeeklyProgressPercentSchema.safeParse(value)
  if (!parsed.success) throw new InternalServerErrorException('Stored weekly progress evidence is invalid')
  return parsed.data
}

function serialize(row: DbRow): ProjectWeeklyProgressRow {
  const percentages = percent(row.percentByCategory)
  return projectWeeklyProgressRowSchema.parse({
    id: row.id,
    projectId: row.projectId,
    progressUpdateId: row.progressUpdateId,
    clientRequestId: row.clientRequestId,
    weekEnding: row.weekEnding,
    cutoffAt: row.cutoffAt.toISOString(),
    status: row.status,
    percentByCategory: percentages,
    notes: row.notes ?? '',
    warSnapshot: row.warSnapshot,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lockedBy: row.lockedBy,
    lockReason: row.lockReason,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

@Injectable()
export class ProjectWeeklyProgressService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    query: ProjectWeeklyProgressListQuery,
    principal: ErpPrincipal,
  ): Promise<ProjectWeeklyProgressListResult> {
    const filters = projectWeeklyProgressListQuerySchema.parse(query)
    await this.requireMembership(principal, 'project.read')
    await this.assertProject(projectId, principal.tenantId)
    const predicate = and(
      eq(projectWeeklyProgress.tenant_id, principal.tenantId),
      eq(projectWeeklyProgress.project_id, projectId),
    )
    const [rows, totals] = await Promise.all([
      this.database.client
        .select(rowSelection)
        .from(projectWeeklyProgress)
        .innerJoin(
          progressUpdates,
          and(
            eq(progressUpdates.id, projectWeeklyProgress.progress_update_id),
            eq(progressUpdates.tenant_id, principal.tenantId),
          ),
        )
        .where(predicate)
        .orderBy(desc(projectWeeklyProgress.week_ending), asc(projectWeeklyProgress.id))
        .limit(filters.limit)
        .offset((filters.page - 1) * filters.limit),
      this.database.client
        .select({ total: count() })
        .from(projectWeeklyProgress)
        .where(predicate),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return projectWeeklyProgressListResultSchema.parse({
      projectId,
      rows: (rows as DbRow[]).map(serialize),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    })
  }

  async create(
    command: CreateProjectWeeklyProgressCommand,
    principal: ErpPrincipal,
    now = new Date(),
  ): Promise<ProjectWeeklyProgressMutationResult> {
    const input = createProjectWeeklyProgressCommandSchema.parse(command)
    const requestHash = commandHash(input)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'project.weekly_progress.submit',
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

      const [requestReplay] = await transaction
        .select(rowSelection)
        .from(projectWeeklyProgress)
        .innerJoin(
          progressUpdates,
          and(
            eq(progressUpdates.id, projectWeeklyProgress.progress_update_id),
            eq(progressUpdates.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .where(
          and(
            eq(projectWeeklyProgress.tenant_id, authorizedPrincipal.tenantId),
            eq(projectWeeklyProgress.client_request_id, input.clientRequestId),
          ),
        )
        .limit(1)
        .for('update')
      if (requestReplay) {
        const replay = requestReplay as unknown as DbRow
        if (replay.requestHash !== requestHash) {
          throw new ConflictException('Client request id was already used with different progress data')
        }
        return projectWeeklyProgressMutationResultSchema.parse({
          projectId: input.projectId,
          created: false,
          changed: false,
          row: serialize(replay),
        })
      }

      const cutoffAt = new Date(weeklyProgressCutoffAt(input.weekEnding))
      if (now.getTime() >= cutoffAt.getTime()) {
        throw new ConflictException('Weekly progress is past the Thursday 17:00 PHT cut-off')
      }

      const [existing] = await transaction
        .select(rowSelection)
        .from(projectWeeklyProgress)
        .innerJoin(
          progressUpdates,
          and(
            eq(progressUpdates.id, projectWeeklyProgress.progress_update_id),
            eq(progressUpdates.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .where(
          and(
            eq(projectWeeklyProgress.tenant_id, authorizedPrincipal.tenantId),
            eq(projectWeeklyProgress.project_id, input.projectId),
            eq(projectWeeklyProgress.week_ending, input.weekEnding),
          ),
        )
        .limit(1)
        .for('update')

      if (existing && (existing as unknown as DbRow).status === 'locked') {
        throw new ConflictException('Weekly progress is already locked into the WAR')
      }

      const [progress] = await transaction
        .insert(progressUpdates)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: input.projectId,
          week_ending: new Date(`${input.weekEnding}T00:00:00.000Z`),
          percent_by_category: input.percentByCategory,
          notes: input.notes,
          submitted_by: authorizedPrincipal.userId,
        })
        .returning({ id: progressUpdates.id })
      if (!progress) throw new InternalServerErrorException('Weekly progress was not captured')

      if (existing) {
        const current = existing as unknown as DbRow
        const [updated] = await transaction
          .update(projectWeeklyProgress)
          .set({
            progress_update_id: progress.id,
            client_request_id: input.clientRequestId,
            request_hash: requestHash,
            version: current.version + 1,
            updated_at: now,
          })
          .where(
            and(
              eq(projectWeeklyProgress.id, current.id),
              eq(projectWeeklyProgress.tenant_id, authorizedPrincipal.tenantId),
              eq(projectWeeklyProgress.version, current.version),
              eq(projectWeeklyProgress.status, 'open'),
            ),
          )
          .returning()
        if (!updated) throw new ConflictException('Weekly progress changed; refresh before submitting again')
        const row = serialize({
          ...(updated as unknown as DbRow),
          percentByCategory: input.percentByCategory,
          notes: input.notes,
        })
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'project_weekly_progress',
          entityId: current.id,
          action: 'update',
          diff: { project_id: input.projectId, week_ending: input.weekEnding, version: row.version },
        })
        return projectWeeklyProgressMutationResultSchema.parse({ projectId: input.projectId, created: false, changed: true, row })
      }

      const [created] = await transaction
        .insert(projectWeeklyProgress)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: input.projectId,
          progress_update_id: progress.id,
          client_request_id: input.clientRequestId,
          request_hash: requestHash,
          week_ending: input.weekEnding,
          cutoff_at: cutoffAt,
          status: 'open',
          war_snapshot: null,
          locked_at: null,
          locked_by: null,
          lock_reason: '',
          version: 1,
          created_by: authorizedPrincipal.userId,
          created_at: now,
          updated_at: now,
        })
        .returning()
      if (!created) throw new InternalServerErrorException('Weekly progress period was not created')
      const row = serialize({
        ...(created as unknown as DbRow),
        percentByCategory: input.percentByCategory,
        notes: input.notes,
      })
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_weekly_progress',
        entityId: row.id,
        action: 'create',
        diff: { project_id: input.projectId, week_ending: input.weekEnding, cutoff_at: cutoffAt.toISOString() },
      })
      return projectWeeklyProgressMutationResultSchema.parse({ projectId: input.projectId, created: true, changed: true, row })
    })
  }

  async lock(
    projectId: string,
    periodId: string,
    command: LockProjectWeeklyProgressCommand,
    principal: ErpPrincipal,
    now = new Date(),
  ): Promise<ProjectWeeklyProgressLockResult> {
    const input = lockProjectWeeklyProgressCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(transaction, principal, 'precon.manage_checklist')
      await this.audit.stampActor(transaction, authorizedPrincipal)
      await this.assertProjectOn(transaction, projectId, authorizedPrincipal.tenantId)
      const [current] = await transaction
        .select(rowSelection)
        .from(projectWeeklyProgress)
        .innerJoin(
          progressUpdates,
          and(
            eq(progressUpdates.id, projectWeeklyProgress.progress_update_id),
            eq(progressUpdates.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .where(
          and(
            eq(projectWeeklyProgress.id, periodId),
            eq(projectWeeklyProgress.project_id, projectId),
            eq(projectWeeklyProgress.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .limit(1)
        .for('update')
      if (!current) throw new NotFoundException('Weekly progress period not found')
      const row = current as unknown as DbRow
      if (row.version !== input.expectedVersion) throw new ConflictException('Weekly progress changed; refresh before locking')
      if (row.status === 'locked') {
        return projectWeeklyProgressLockResultSchema.parse({ projectId, changed: false, row: serialize(row) })
      }
      if (now.getTime() < row.cutoffAt.getTime()) {
        throw new ConflictException('Weekly progress cannot be locked before the Thursday 17:00 PHT cut-off')
      }
      const percentages = percent(row.percentByCategory)
      const snapshot = {
        weekEnding: row.weekEnding,
        overallPct: percentages.overall_pct,
        percentByCategory: percentages,
        notes: row.notes ?? '',
        capturedAt: now.toISOString(),
      }
      const [updated] = await transaction
        .update(projectWeeklyProgress)
        .set({
          status: 'locked',
          war_snapshot: snapshot,
          locked_at: now,
          locked_by: authorizedPrincipal.userId,
          lock_reason: input.lockReason,
          version: row.version + 1,
          updated_at: now,
        })
        .where(
          and(
            eq(projectWeeklyProgress.id, periodId),
            eq(projectWeeklyProgress.project_id, projectId),
            eq(projectWeeklyProgress.tenant_id, authorizedPrincipal.tenantId),
            eq(projectWeeklyProgress.status, 'open'),
            eq(projectWeeklyProgress.version, row.version),
          ),
        )
        .returning()
      if (!updated) throw new ConflictException('Weekly progress changed; refresh before locking')
      const locked = serialize({ ...(updated as unknown as DbRow), percentByCategory: percentages, notes: row.notes })
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_weekly_progress',
        entityId: periodId,
        action: 'lock',
        diff: { project_id: projectId, week_ending: row.weekEnding, cutoff_at: row.cutoffAt.toISOString(), lock_reason: input.lockReason },
      })
      return projectWeeklyProgressLockResultSchema.parse({ projectId, changed: true, row: locked })
    })
  }

  private async assertProject(projectId: string, tenantId: string): Promise<void> {
    await this.assertProjectOn(this.database.client, projectId, tenantId)
  }

  private async assertProjectOn(client: DatabaseService['client'] | DatabaseTransaction, projectId: string, tenantId: string): Promise<void> {
    const [project] = await client.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at))).limit(1)
    if (!project) throw new NotFoundException('Project not found')
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
