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
  auditLog,
  progressUpdates,
  projectWeeklyProgress,
  projects,
  tenants,
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
  weeklyProgressCapturePayload,
  weeklyProgressLockPayload,
  projectWeeklyProgressCommandReceiptSchema,
  type ProjectWeeklyProgressCommandReceipt,
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
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

const periodSelection = {
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
}

const rowSelection = {
  ...periodSelection,
  percentByCategory: progressUpdates.percent_by_category,
  notes: progressUpdates.notes,
  evidenceWeek: sql<string>`to_char(${progressUpdates.week_ending} at time zone 'UTC', 'YYYY-MM-DD')`,
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
  evidenceWeek?: string
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
  ): Promise<ProjectWeeklyProgressMutationResult> {
    const parsed = createProjectWeeklyProgressCommandSchema.parse(command)
    const input = { ...parsed, projectId: parsed.projectId.toLowerCase(), clientRequestId: parsed.clientRequestId.toLowerCase() }
    const requestHash = commandHash(input)
    const payloadHash = createHash('sha256').update(weeklyProgressCapturePayload(input)).digest('hex')
    return this.mutationTransaction(async (transaction) => {
      const authorizedPrincipal = await this.admitMutation(
        transaction,
        principal,
        'project.weekly_progress.submit',
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      await this.lockProject(transaction, input.projectId, authorizedPrincipal.tenantId)

      const replay = await this.findReceipt(transaction, authorizedPrincipal, input.projectId, input.clientRequestId, 'capture', payloadHash)
      if (replay?.operation === 'capture') return projectWeeklyProgressMutationResultSchema.parse({ projectId: input.projectId, created: false, changed: false, row: replay.row, receipt: replay })
      await this.rejectLegacyKey(transaction, authorizedPrincipal.tenantId, input.clientRequestId)

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
      if (existing) this.assertEvidence(existing as unknown as DbRow)
      const { now } = await this.clock(transaction)
      const cutoffAt = new Date(weeklyProgressCutoffAt(input.weekEnding))
      if (now.getTime() >= cutoffAt.getTime()) throw new ConflictException('Weekly progress is past the Thursday 17:00 PHT cut-off')

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
          .returning(periodSelection)
        if (!updated) throw new ConflictException('Weekly progress changed; refresh before submitting again')
        const row = serialize({
          ...updated,
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
        const receipt = await this.saveReceipt(transaction, { schemaVersion: 1, tenantId: authorizedPrincipal.tenantId, actorId: authorizedPrincipal.userId, projectId: input.projectId, clientRequestId: input.clientRequestId, payloadHash, operation: 'capture', created: false, row })
        return projectWeeklyProgressMutationResultSchema.parse({ projectId: input.projectId, created: false, changed: true, row, receipt })
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
        .returning(periodSelection)
      if (!created) throw new InternalServerErrorException('Weekly progress period was not created')
      const row = serialize({
        ...created,
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
      const receipt = await this.saveReceipt(transaction, { schemaVersion: 1, tenantId: authorizedPrincipal.tenantId, actorId: authorizedPrincipal.userId, projectId: input.projectId, clientRequestId: input.clientRequestId, payloadHash, operation: 'capture', created: true, row })
      return projectWeeklyProgressMutationResultSchema.parse({ projectId: input.projectId, created: true, changed: true, row, receipt })
    })
  }

  async lock(
    projectId: string,
    periodId: string,
    command: LockProjectWeeklyProgressCommand,
    principal: ErpPrincipal,
  ): Promise<ProjectWeeklyProgressLockResult> {
    const input = lockProjectWeeklyProgressCommandSchema.parse(command)
    projectId = z.string().guid().parse(projectId).toLowerCase()
    periodId = z.string().guid().parse(periodId).toLowerCase()
    const requestId = input.clientRequestId?.toLowerCase()
    const payloadHash = createHash('sha256').update(weeklyProgressLockPayload(projectId, periodId, input)).digest('hex')
    return this.mutationTransaction(async (transaction) => {
      const authorizedPrincipal = await this.admitMutation(transaction, principal, 'precon.manage_checklist')
      await this.audit.stampActor(transaction, authorizedPrincipal)
      await this.lockProject(transaction, projectId, authorizedPrincipal.tenantId)
      if (requestId) {
        const replay = await this.findReceipt(transaction, authorizedPrincipal, projectId, requestId, 'lock', payloadHash)
        if (replay) return projectWeeklyProgressLockResultSchema.parse({ projectId, changed: false, row: replay.row, receipt: replay })
        await this.rejectLegacyKey(transaction, authorizedPrincipal.tenantId, requestId)
      }
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
        if (requestId) throw new ConflictException('Weekly progress is already locked; reconcile the existing WAR record')
        return projectWeeklyProgressLockResultSchema.parse({ projectId, changed: false, row: serialize(row) })
      }
      this.assertEvidence(row)
      const { now, transactionStart } = await this.clock(transaction)
      if (now.getTime() < row.cutoffAt.getTime() || transactionStart.getTime() < row.cutoffAt.getTime()) {
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
        .returning(periodSelection)
      if (!updated) throw new ConflictException('Weekly progress changed; refresh before locking')
      const locked = serialize({ ...updated, percentByCategory: percentages, notes: row.notes })
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_weekly_progress',
        entityId: periodId,
        action: 'lock',
        diff: { project_id: projectId, week_ending: row.weekEnding, cutoff_at: row.cutoffAt.toISOString(), lock_reason: input.lockReason },
      })
      const receipt = requestId ? await this.saveReceipt(transaction, { schemaVersion: 1, tenantId: authorizedPrincipal.tenantId, actorId: authorizedPrincipal.userId, projectId, clientRequestId: requestId, payloadHash, operation: 'lock', expectedVersion: input.expectedVersion, row: locked }) : undefined
      return projectWeeklyProgressLockResultSchema.parse({ projectId, changed: true, row: locked, ...(receipt ? { receipt } : {}) })
    })
  }

  private async clock(transaction: DatabaseTransaction): Promise<{ now: Date; transactionStart: Date }> {
    const [clock] = await transaction.execute<{ now: string; transactionStart: string }>(sql`select clock_timestamp()::text as now, transaction_timestamp()::text as "transactionStart"`)
    if (!clock) throw new InternalServerErrorException('Database clock unavailable')
    const now = new Date(clock.now), transactionStart = new Date(clock.transactionStart)
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(transactionStart.getTime())) throw new InternalServerErrorException('Database clock unavailable')
    return { now, transactionStart }
  }

  private assertEvidence(row: DbRow): void {
    if (row.evidenceWeek !== row.weekEnding || row.cutoffAt.toISOString() !== weeklyProgressCutoffAt(row.weekEnding)) throw new ConflictException('Weekly progress period evidence requires reconciliation')
  }

  private async findReceipt(transaction: DatabaseTransaction, actor: ErpPrincipal, projectId: string, requestId: string, operation: 'capture' | 'lock', payloadHash: string): Promise<ProjectWeeklyProgressCommandReceipt | undefined> {
    const rows = await transaction.select({ actorId: auditLog.actor_id, action: auditLog.action, diff: auditLog.diff }).from(auditLog).where(and(eq(auditLog.tenant_id, actor.tenantId), eq(auditLog.entity_type, 'project_weekly_progress_command'), eq(auditLog.entity_id, requestId))).limit(2)
    if (!rows.length) return undefined
    const stored = z.object({ schemaVersion: z.literal(1), payloadHash: z.string(), receipt: projectWeeklyProgressCommandReceiptSchema }).strict().safeParse(rows[0]!.diff)
    if (rows.length !== 1 || !stored.success) throw new ConflictException('Weekly progress command receipt requires reconciliation')
    const receipt = stored.data.receipt
    if (rows[0]!.action !== (receipt.operation === 'capture' ? 'create' : 'lock')) throw new ConflictException('Weekly progress command receipt requires reconciliation')
    if (rows[0]!.actorId !== actor.userId || receipt.tenantId !== actor.tenantId || receipt.actorId !== actor.userId || receipt.projectId !== projectId || receipt.row.projectId !== projectId || receipt.clientRequestId !== requestId || receipt.operation !== operation || receipt.payloadHash !== payloadHash || stored.data.payloadHash !== payloadHash) throw new ConflictException('Client request id was already used by another command')
    this.assertReceipt(receipt)
    return receipt
  }

  private assertReceipt(receipt: ProjectWeeklyProgressCommandReceipt): void {
    const row = receipt.row
    let valid = row.cutoffAt === weeklyProgressCutoffAt(row.weekEnding) && Date.parse(row.updatedAt) >= Date.parse(row.createdAt)
    let payload: string
    if (receipt.operation === 'capture') {
      valid &&= row.status === 'open' && row.warSnapshot === null && row.lockedAt === null && row.lockedBy === null && row.lockReason === '' && row.clientRequestId === receipt.clientRequestId && Date.parse(row.updatedAt) < Date.parse(row.cutoffAt) && (receipt.created ? row.version === 1 && row.createdBy === receipt.actorId : row.version >= 2)
      payload = weeklyProgressCapturePayload({ projectId: receipt.projectId, clientRequestId: receipt.clientRequestId, weekEnding: row.weekEnding, notes: row.notes, percentByCategory: row.percentByCategory })
    } else {
      valid &&= row.status === 'locked' && row.version === receipt.expectedVersion + 1 && row.lockedBy === receipt.actorId && row.lockedAt !== null && Date.parse(row.lockedAt) >= Date.parse(row.cutoffAt) && row.updatedAt === row.lockedAt && row.warSnapshot !== null && row.warSnapshot.weekEnding === row.weekEnding && row.warSnapshot.notes === row.notes && row.warSnapshot.overallPct === row.percentByCategory.overall_pct && canonicalJson(row.warSnapshot.percentByCategory) === canonicalJson(row.percentByCategory) && row.warSnapshot.capturedAt === row.lockedAt
      payload = weeklyProgressLockPayload(receipt.projectId, row.id, { expectedVersion: receipt.expectedVersion, lockReason: row.lockReason })
    }
    if (!valid || createHash('sha256').update(payload).digest('hex') !== receipt.payloadHash) throw new ConflictException('Weekly progress command receipt requires reconciliation')
  }

  private async rejectLegacyKey(transaction: DatabaseTransaction, tenantId: string, requestId: string): Promise<void> {
    const [legacy] = await transaction.execute<{ found: boolean }>(sql`select (
      exists(select 1 from ${projectWeeklyProgress} where ${projectWeeklyProgress.tenant_id} = ${tenantId}::uuid and ${projectWeeklyProgress.client_request_id} = ${requestId}::uuid)
      or exists(select 1 from ${auditLog} where ${auditLog.tenant_id} = ${tenantId}::uuid and ${auditLog.entity_type} = 'project_weekly_progress' and (
        lower(${auditLog.diff}->>'client_request_id') = ${requestId}
        or lower(${auditLog.diff}->'client_request_id'->>'before') = ${requestId}
        or lower(${auditLog.diff}->'client_request_id'->>'after') = ${requestId}
      ))
    ) as found`)
    if (legacy?.found) throw new ConflictException('Legacy weekly progress request requires reconciliation; refresh the existing record')
  }

  private async saveReceipt(transaction: DatabaseTransaction, value: ProjectWeeklyProgressCommandReceipt): Promise<ProjectWeeklyProgressCommandReceipt> {
    const receipt = projectWeeklyProgressCommandReceiptSchema.parse(value)
    this.assertReceipt(receipt)
    await this.audit.writeSemantic(transaction, { tenantId: receipt.tenantId, actorId: receipt.actorId, entityType: 'project_weekly_progress_command', entityId: receipt.clientRequestId, action: receipt.operation === 'capture' ? 'create' : 'lock', diff: { schemaVersion: 1, payloadHash: receipt.payloadHash, receipt } })
    return receipt
  }

  private async mutationTransaction<T>(operation: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.database.client.transaction(operation)
    } catch (error) {
      const seen = new Set<object>()
      let cause: unknown = error
      while (cause && typeof cause === 'object' && !seen.has(cause)) {
        seen.add(cause)
        if ('code' in cause && (cause.code === '55P03' || cause.code === '40P01')) {
          throw new ConflictException('Weekly progress authority is changing; refresh before trying again')
        }
        cause = 'cause' in cause ? cause.cause : undefined
      }
      throw error
    }
  }

  private async admitMutation(transaction: DatabaseTransaction, principal: ErpPrincipal, capability: ErpCapability): Promise<ErpPrincipal> {
    await transaction.execute(sql`select set_config('lock_timeout', '3s', true)`)
    const [actor] = await transaction
      .select({ role: users.role, status: users.account_status, email: users.email })
      .from(users)
      .where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId)))
      .limit(1)
      .for('share', { noWait: true })
    const role = z.enum(ERP_ROLES).safeParse(actor?.role)
    if (!actor || actor.status !== 'active' || !role.success || !roleHasCapability(role.data, capability)) throw new ForbiddenException()
    const [tenant] = await transaction
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, principal.tenantId))
      .limit(1)
      .for('share', { noWait: true })
    if (tenant?.status !== 'active') throw new ForbiddenException('Current tenant is not active')
    const currentPrincipal: ErpPrincipal = {
      userId: principal.userId.toLowerCase(),
      tenantId: principal.tenantId.toLowerCase(),
      role: role.data,
      email: actor.email,
    }
    // Admit the audit chain before project locks, including legacy project-first writers.
    if (!await this.audit.tryLockTenantChain(transaction, currentPrincipal.tenantId)) throw new ConflictException('Project writes are busy; refresh before trying again')
    return currentPrincipal
  }

  private async lockProject(transaction: DatabaseTransaction, projectId: string, tenantId: string): Promise<void> {
    const [project] = await transaction.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at))).limit(1).for('update', { noWait: true })
    if (!project) throw new NotFoundException('Project not found')
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
