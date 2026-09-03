import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  auditLog,
  dailyTasks,
  slaLogs,
  users,
} from '@third-code-erp/database/schema'
import {
  dailyTaskCompletionCommandSchema,
  dailyTaskCompletionResultSchema,
  type DailyTaskCompletionCommand,
  type DailyTaskCompletionResult,
} from '@third-code-erp/shared-types'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
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

const TOOLBOX_TASK_TITLE = 'toolbox meeting log'
const IDEMPOTENCY_KEY_MAX_LENGTH = 256
const RECEIPT_SOURCE = 'daily_task_completion_core'
const receiptDiffSchema = z
  .object({
    idempotency_key_hash: z.string().regex(/^[a-f0-9]{64}$/),
    command_hash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .passthrough()

export const DAILY_TASK_COMPLETION_CLOCK = Symbol(
  'DAILY_TASK_COMPLETION_CLOCK'
)
type CompletionClock = () => Date

type LockedTask = {
  id: string
  tenantId: string
  projectId: string
  assigneeId: string | null
  title: string
  status: 'pending' | 'done' | 'skipped'
  completionNotes: string | null
  completedAt: Date | null
  completedBy: string | null
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
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

function validateIdempotencyKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

function resultFor(task: LockedTask): DailyTaskCompletionResult {
  const parsed = dailyTaskCompletionResultSchema.safeParse({
    ok: true,
    taskId: task.id,
    tenantId: task.tenantId,
    projectId: task.projectId,
    assigneeId: task.assigneeId,
    status: task.status,
    completionNotes: task.completionNotes,
    completedAt: task.completedAt?.toISOString(),
    completedBy: task.completedBy,
  })
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Persisted daily task completion is invalid'
    )
  }
  return parsed.data
}

@Injectable()
export class DailyTaskCompletionService {
  private readonly clock: CompletionClock

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional()
    @Inject(DAILY_TASK_COMPLETION_CLOCK)
    clock?: CompletionClock
  ) {
    this.clock = clock ?? (() => new Date())
  }

  async complete(
    taskId: string,
    command: DailyTaskCompletionCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<DailyTaskCompletionResult> {
    const parsedCommand = dailyTaskCompletionCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    const keyHash = sha256(idempotencyKey)
    const commandHash = sha256(canonicalJson({ command: parsedCommand, taskId }))

    return this.database.client.transaction((transaction) =>
      this.completeInTransaction(
        transaction,
        taskId,
        parsedCommand,
        principal,
        keyHash,
        commandHash
      )
    )
  }

  private async completeInTransaction(
    transaction: DatabaseTransaction,
    taskId: string,
    command: DailyTaskCompletionCommand,
    principal: ErpPrincipal,
    keyHash: string,
    commandHash: string
  ): Promise<DailyTaskCompletionResult> {
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
    const role = membership?.role as ErpRole | undefined
    if (!membership || !role || !roleHasCapability(role, 'sd.daily_tasks')) {
      throw new ForbiddenException()
    }
    const authorizedPrincipal: ErpPrincipal = {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role,
      email: membership.email,
    }

    // PostgreSQL's 64-bit advisory key can collide only into extra serialization.
    // Receipt identity still compares the full tenant-scoped SHA-256 value below.
    await transaction.execute(sql`
      select pg_advisory_xact_lock(
        hashtextextended(${
          `daily_task_completion:${authorizedPrincipal.tenantId}:${keyHash}`
        }, 0)
      )
    `)

    const [task] = await transaction
      .select({
        id: dailyTasks.id,
        tenantId: dailyTasks.tenant_id,
        projectId: dailyTasks.project_id,
        assigneeId: dailyTasks.assignee_id,
        title: dailyTasks.title,
        status: dailyTasks.status,
        completionNotes: dailyTasks.completion_notes,
        completedAt: dailyTasks.completed_at,
        completedBy: dailyTasks.completed_by,
      })
      .from(dailyTasks)
      .where(
        and(
          eq(dailyTasks.id, taskId),
          eq(dailyTasks.tenant_id, authorizedPrincipal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    if (!task) throw new NotFoundException('Daily task not found')

    const canOverrideAssignee = role === 'owner' || role === 'admin'
    if (!canOverrideAssignee && task.assigneeId !== authorizedPrincipal.userId) {
      throw new ForbiddenException()
    }
    await this.audit.stampActor(transaction, authorizedPrincipal)

    const [receipt] = await transaction
      .select({
        entityId: auditLog.entity_id,
        diff: auditLog.diff,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenant_id, authorizedPrincipal.tenantId),
          eq(auditLog.entity_type, 'daily_task'),
          eq(auditLog.action, 'status_change'),
          sql`${auditLog.diff}->>'source' = ${RECEIPT_SOURCE}`,
          sql`${auditLog.diff}->>'idempotency_key_hash' = ${keyHash}`
        )
      )
      .limit(1)
    if (receipt) {
      const parsedReceipt = receiptDiffSchema.safeParse(receipt.diff)
      if (
        !parsedReceipt.success ||
        receipt.entityId !== taskId ||
        parsedReceipt.data.idempotency_key_hash !== keyHash ||
        parsedReceipt.data.command_hash !== commandHash
      ) {
        throw new ConflictException(
          'Idempotency-Key was already used for a different command'
        )
      }
      if (task.status !== 'done') {
        throw new InternalServerErrorException(
          'Daily task completion receipt has no completed task'
        )
      }
      return resultFor(task)
    }

    if (task.status === 'done') return resultFor(task)
    if (task.status === 'skipped') {
      throw new ConflictException('Skipped daily tasks cannot be completed')
    }
    if (
      task.title.trim().toLowerCase() === TOOLBOX_TASK_TITLE &&
      !command.notes
    ) {
      throw new ConflictException('Toolbox meeting log requires notes')
    }

    const completedAt = this.clock()
    const [completedTask] = await transaction
      .update(dailyTasks)
      .set({
        status: 'done',
        completion_notes: command.notes ?? null,
        completed_at: completedAt,
        completed_by: authorizedPrincipal.userId,
      })
      .where(
        and(
          eq(dailyTasks.id, task.id),
          eq(dailyTasks.tenant_id, authorizedPrincipal.tenantId),
          eq(dailyTasks.status, 'pending')
        )
      )
      .returning({
        id: dailyTasks.id,
        tenantId: dailyTasks.tenant_id,
        projectId: dailyTasks.project_id,
        assigneeId: dailyTasks.assignee_id,
        title: dailyTasks.title,
        status: dailyTasks.status,
        completionNotes: dailyTasks.completion_notes,
        completedAt: dailyTasks.completed_at,
        completedBy: dailyTasks.completed_by,
      })
    if (!completedTask) {
      throw new ConflictException('Daily task is no longer pending')
    }

    // Existing stopSlaClock semantics close all matching open legacy rows.
    // No matching open row is a valid no-op; a database error aborts this transaction.
    await transaction
      .update(slaLogs)
      .set({ completed_at: completedAt })
      .where(
        and(
          eq(slaLogs.tenant_id, authorizedPrincipal.tenantId),
          eq(slaLogs.entity_type, 'daily_task'),
          eq(slaLogs.entity_id, task.id),
          isNull(slaLogs.completed_at)
        )
      )
      .returning({ id: slaLogs.id })

    await this.audit.writeSemantic(transaction, {
      tenantId: authorizedPrincipal.tenantId,
      actorId: authorizedPrincipal.userId,
      entityType: 'daily_task',
      entityId: task.id,
      action: 'status_change',
      diff: {
        from_status: 'pending',
        to_status: 'done',
        completion_notes_present: Boolean(command.notes),
        source: RECEIPT_SOURCE,
        idempotency_key_hash: keyHash,
        command_hash: commandHash,
      },
    })

    return resultFor(completedTask)
  }
}
