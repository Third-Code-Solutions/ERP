import {
  ForbiddenException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  approvalRules,
  approvals,
  processSteps,
  slaClocks,
  taskInstances,
  users,
  businessCalendarHolidays,
  type ProcessStep,
  type Approval,
  type ApprovalRule,
  type SlaClock,
  type TaskInstance,
} from '@third-code-erp/database/schema'
import {
  createSlaClockSchedule,
  createBusinessDayService,
  evaluateSlaClock,
  mergeBusinessDayCalendars,
  philippineHolidays,
  slaClockDefinitionSchema,
  type CreateProcessStepCommand,
  type CreateTaskInstanceCommand,
  type EvaluateSlaClockCommand,
  type ProcessHealthResult,
  type ProcessStepResult,
  type SlaClockResult,
  type SetSlaObserveModeCommand,
  type StartProcessClockCommand,
  type TaskInstanceResult,
  type AssignTaskInstanceCommand,
  type UpdateTaskStatusCommand,
  type ApprovalResult,
  type ApprovalRuleResult,
  type CreateApprovalCommand,
  type CreateApprovalRuleCommand,
  type DecideApprovalCommand,
  type BusinessDayService,
} from '@third-code-erp/shared-types'
import { and, asc, eq, lt, ne, notInArray } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

type HealthCounter = {
  openTasks: number
  atRiskClocks: number
  breachedClocks: number
  escalatedClocks: number
  externalBreachedClocks: number
}

const tenantHolidayRowSchema = z.object({
  date: z.string(),
  name: z.string(),
  kind: z.enum(['regular', 'special_non_working', 'local']),
  source: z.string(),
  is_enabled: z.boolean(),
})

@Injectable()
export class ProcessService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(AuditService)
    private readonly audit: AuditService
  ) {}

  async listSteps(principal: ErpPrincipal): Promise<ProcessStepResult[]> {
    const rows = await this.database.client
      .select()
      .from(processSteps)
      .where(
        and(
          eq(processSteps.tenant_id, principal.tenantId),
          eq(processSteps.is_active, true)
        )
      )
      .orderBy(asc(processSteps.code))

    return rows.map((row) => this.stepResult(row))
  }

  async createStep(
    command: CreateProcessStepCommand,
    principal: ErpPrincipal
  ): Promise<ProcessStepResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [existingCode] = await transaction
        .select({ id: processSteps.id })
        .from(processSteps)
        .where(
          and(
            eq(processSteps.tenant_id, principal.tenantId),
            eq(processSteps.code, command.code)
          )
        )
        .limit(1)

      if (existingCode) {
        throw new ConflictException('Process-step code already exists')
      }

      if (command.predecessorCode) {
        const [predecessor] = await transaction
          .select({ id: processSteps.id })
          .from(processSteps)
          .where(
            and(
              eq(processSteps.tenant_id, principal.tenantId),
              eq(processSteps.code, command.predecessorCode),
              eq(processSteps.is_active, true)
            )
          )
          .limit(1)

        if (!predecessor) {
          throw new NotFoundException('Predecessor process step not found')
        }
      }

      const [created] = await transaction
        .insert(processSteps)
        .values({
          tenant_id: principal.tenantId,
          code: command.code,
          stage: command.stage,
          name: command.name,
          responsible_bu: command.responsibleBu,
          input: command.input,
          input_from: command.inputFrom,
          output: command.output,
          output_by: command.outputBy,
          sla_days: command.slaDays ?? null,
          sla_hours: command.slaHours ?? null,
          is_business_days: command.isBusinessDays,
          clock_scope: command.clockScope,
          template_link: command.templateLink ?? null,
          predecessor_code: command.predecessorCode ?? null,
          created_by: principal.userId,
          updated_by: principal.userId,
        })
        .returning()

      if (!created) {
        throw new InternalServerErrorException(
          'Process-step insert returned no record'
        )
      }

      // Database audit trigger writes exactly one append-only row for this
      // mutation after stampActor supplies authenticated actor context.
      return this.stepResult(created)
    })
  }

  async listApprovalRules(
    principal: ErpPrincipal,
    objectType?: string
  ): Promise<ApprovalRuleResult[]> {
    const rows = objectType
      ? await this.database.client
          .select()
          .from(approvalRules)
          .where(
            and(
              eq(approvalRules.tenant_id, principal.tenantId),
              eq(approvalRules.object_type, objectType),
              eq(approvalRules.is_active, true)
            )
          )
          .orderBy(asc(approvalRules.object_type), asc(approvalRules.sequence))
      : await this.database.client
          .select()
          .from(approvalRules)
          .where(
            and(
              eq(approvalRules.tenant_id, principal.tenantId),
              eq(approvalRules.is_active, true)
            )
          )
          .orderBy(asc(approvalRules.object_type), asc(approvalRules.sequence))

    return rows.map((row) => this.approvalRuleResult(row))
  }

  async createApprovalRule(
    command: CreateApprovalRuleCommand,
    principal: ErpPrincipal
  ): Promise<ApprovalRuleResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)
      const [created] = await transaction
        .insert(approvalRules)
        .values({
          tenant_id: principal.tenantId,
          object_type: command.objectType,
          amount_band_low: BigInt(command.amountBandLow),
          amount_band_high:
            command.amountBandHigh === undefined ||
            command.amountBandHigh === null
              ? null
              : BigInt(command.amountBandHigh),
          approver_role: command.approverRole,
          sequence: command.sequence,
          escalation_after_days: command.escalationAfterDays ?? null,
          created_by: principal.userId,
          updated_by: principal.userId,
        })
        .returning()
      if (!created) {
        throw new InternalServerErrorException(
          'Approval-rule insert returned no record'
        )
      }
      return this.approvalRuleResult(created)
    })
  }

  async createApproval(
    command: CreateApprovalCommand,
    principal: ErpPrincipal
  ): Promise<ApprovalResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)
      const [rule] = await transaction
        .select()
        .from(approvalRules)
        .where(
          and(
            eq(approvalRules.id, command.approvalRuleId),
            eq(approvalRules.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!rule) throw new NotFoundException('Approval rule not found')
      if (!rule.is_active) {
        throw new ConflictException('Approval rule is inactive')
      }
      if (rule.object_type !== command.objectType) {
        throw new ConflictException(
          'Approval rule object type does not match the approval'
        )
      }
      if (rule.sequence !== command.sequence) {
        throw new ConflictException('Approval sequence does not match rule')
      }

      const [existing] = await transaction
        .select({ id: approvals.id })
        .from(approvals)
        .where(
          and(
            eq(approvals.tenant_id, principal.tenantId),
            eq(approvals.object_type, command.objectType),
            eq(approvals.object_id, command.objectId),
            eq(approvals.sequence, command.sequence)
          )
        )
        .limit(1)
      if (existing) {
        throw new ConflictException('Approval sequence already exists')
      }

      if (command.sequence > 1) {
        const prior = await transaction
          .select({ status: approvals.status })
          .from(approvals)
          .where(
            and(
              eq(approvals.tenant_id, principal.tenantId),
              eq(approvals.object_type, command.objectType),
              eq(approvals.object_id, command.objectId),
              lt(approvals.sequence, command.sequence)
            )
          )
        if (
          prior.length === 0 ||
          prior.some((approval) => approval.status !== 'approved')
        ) {
          throw new ConflictException(
            'Prior approval sequences must be approved first'
          )
        }
      }

      if (command.approverUserId) {
        await this.assertTenantUser(
          transaction,
          command.approverUserId,
          principal.tenantId
        )
      }

      const [created] = await transaction
        .insert(approvals)
        .values({
          tenant_id: principal.tenantId,
          object_type: command.objectType,
          object_id: command.objectId,
          approval_rule_id: rule.id,
          sequence: command.sequence,
          approver_user_id: command.approverUserId ?? null,
          created_by: principal.userId,
          updated_by: principal.userId,
        })
        .returning()
      if (!created) {
        throw new InternalServerErrorException(
          'Approval insert returned no record'
        )
      }
      return this.approvalResult(created)
    })
  }

  async decideApproval(
    approvalId: string,
    command: DecideApprovalCommand,
    principal: ErpPrincipal
  ): Promise<ApprovalResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)
      const [approval] = await transaction
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.id, approvalId),
            eq(approvals.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!approval) throw new NotFoundException('Approval not found')
      if (approval.status !== 'pending') {
        throw new ConflictException('Approval is no longer pending')
      }
      if (approval.created_by === principal.userId) {
        throw new ConflictException('Approval creator cannot self-approve')
      }

      const [rule] = await transaction
        .select({ approverRole: approvalRules.approver_role })
        .from(approvalRules)
        .where(
          and(
            eq(approvalRules.id, approval.approval_rule_id),
            eq(approvalRules.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
      if (!rule) throw new NotFoundException('Approval rule not found')

      const elevated = principal.role === 'owner' || principal.role === 'admin'
      if (
        !elevated &&
        ((approval.approver_user_id !== null &&
          approval.approver_user_id !== principal.userId) ||
          (approval.approver_user_id === null &&
            principal.role !== rule.approverRole))
      ) {
        throw new ForbiddenException('Approval role or assignee mismatch')
      }

      const [updated] = await transaction
        .update(approvals)
        .set({
          status: command.status,
          approver_user_id: approval.approver_user_id ?? principal.userId,
          decided_at: new Date(),
          decision_note: command.decisionNote ?? null,
          updated_by: principal.userId,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(approvals.id, approvalId),
            eq(approvals.tenant_id, principal.tenantId),
            eq(approvals.status, 'pending')
          )
        )
        .returning()
      if (!updated) throw new ConflictException('Approval was already decided')
      return this.approvalResult(updated)
    })
  }

  async createTask(
    command: CreateTaskInstanceCommand,
    principal: ErpPrincipal
  ): Promise<TaskInstanceResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [step] = await transaction
        .select({
          id: processSteps.id,
          isActive: processSteps.is_active,
        })
        .from(processSteps)
        .where(
          and(
            eq(processSteps.id, command.processStepId),
            eq(processSteps.tenant_id, principal.tenantId)
          )
        )
        .limit(1)

      if (!step) throw new NotFoundException('Process step not found')
      if (!step.isActive) {
        throw new ConflictException('Cannot create task from inactive step')
      }

      const [existingInstance] = await transaction
        .select({ id: taskInstances.id })
        .from(taskInstances)
        .where(
          and(
            eq(taskInstances.tenant_id, principal.tenantId),
            eq(taskInstances.instance_key, command.instanceKey)
          )
        )
        .limit(1)
      if (existingInstance) {
        throw new ConflictException('Task instance key already exists')
      }

      if (command.assignedTo) {
        await this.assertTenantUser(
          transaction,
          command.assignedTo,
          principal.tenantId
        )
      }

      const [created] = await transaction
        .insert(taskInstances)
        .values({
          tenant_id: principal.tenantId,
          process_step_id: step.id,
          subject_type: command.subjectType,
          subject_id: command.subjectId,
          instance_key: command.instanceKey,
          assigned_to: command.assignedTo ?? null,
          created_by: principal.userId,
          updated_by: principal.userId,
        })
        .returning()

      if (!created) {
        throw new InternalServerErrorException(
          'Task insert returned no record'
        )
      }

      return this.taskResult(created)
    })
  }

  async assignTask(
    taskId: string,
    command: AssignTaskInstanceCommand,
    principal: ErpPrincipal
  ): Promise<TaskInstanceResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [task] = await transaction
        .select()
        .from(taskInstances)
        .where(
          and(
            eq(taskInstances.id, taskId),
            eq(taskInstances.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!task) throw new NotFoundException('Task not found')

      if (command.assignedTo) {
        await this.assertTenantUser(
          transaction,
          command.assignedTo,
          principal.tenantId
        )
      }

      const [updated] = await transaction
        .update(taskInstances)
        .set({
          assigned_to: command.assignedTo,
          updated_by: principal.userId,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(taskInstances.id, taskId),
            eq(taskInstances.tenant_id, principal.tenantId)
          )
        )
        .returning()

      if (!updated) throw new NotFoundException('Task not found')
      return this.taskResult(updated)
    })
  }

  async updateTaskStatus(
    taskId: string,
    command: UpdateTaskStatusCommand,
    principal: ErpPrincipal
  ): Promise<TaskInstanceResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [task] = await transaction
        .select()
        .from(taskInstances)
        .where(
          and(
            eq(taskInstances.id, taskId),
            eq(taskInstances.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!task) throw new NotFoundException('Task not found')

      const allowedTransitions: Record<
        TaskInstance['status'],
        readonly TaskInstance['status'][]
      > = {
        pending: ['in_progress', 'blocked', 'cancelled'],
        in_progress: ['blocked', 'completed', 'cancelled'],
        blocked: ['in_progress', 'cancelled'],
        completed: [],
        cancelled: [],
      }

      if (!allowedTransitions[task.status].includes(command.status)) {
        throw new ConflictException(
          `Cannot transition task from ${task.status} to ${command.status}`
        )
      }

      const now = new Date()
      const [updated] = await transaction
        .update(taskInstances)
        .set({
          status: command.status,
          blocked_reason:
            command.status === 'blocked' ? command.blockedReason! : null,
          started_at:
            command.status === 'in_progress'
              ? task.started_at ?? now
              : task.started_at,
          completed_at:
            command.status === 'completed' ? now : task.completed_at,
          updated_by: principal.userId,
          updated_at: now,
        })
        .where(
          and(
            eq(taskInstances.id, taskId),
            eq(taskInstances.tenant_id, principal.tenantId)
          )
        )
        .returning()

      if (!updated) throw new NotFoundException('Task not found')

      if (command.status === 'completed' || command.status === 'cancelled') {
        await transaction
          .update(slaClocks)
          .set({
            status:
              command.status === 'completed' ? 'completed' : 'cancelled',
            updated_by: principal.userId,
            updated_at: now,
          })
          .where(
            and(
              eq(slaClocks.task_instance_id, taskId),
              eq(slaClocks.tenant_id, principal.tenantId),
              notInArray(slaClocks.status, ['completed', 'cancelled'])
            )
          )
      }

      return this.taskResult(updated)
    })
  }

  async startClock(
    taskId: string,
    command: StartProcessClockCommand,
    principal: ErpPrincipal
  ): Promise<SlaClockResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)

      const [task] = await transaction
        .select()
        .from(taskInstances)
        .where(
          and(
            eq(taskInstances.id, taskId),
            eq(taskInstances.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!task) throw new NotFoundException('Task not found')
      if (task.status === 'completed' || task.status === 'cancelled') {
        throw new ConflictException('Cannot clock a terminal task')
      }
      if (!task.assigned_to) {
        throw new ConflictException('Task must be assigned before clock starts')
      }

      const [existingClock] = await transaction
        .select()
        .from(slaClocks)
        .where(
          and(
            eq(slaClocks.tenant_id, principal.tenantId),
            eq(slaClocks.task_instance_id, taskId),
            notInArray(slaClocks.status, ['completed', 'cancelled'])
          )
        )
        .limit(1)
        .for('update')
      if (existingClock) return this.clockResult(existingClock, new Date())

      const [step] = await transaction
        .select()
        .from(processSteps)
        .where(
          and(
            eq(processSteps.id, task.process_step_id),
            eq(processSteps.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
      if (!step) throw new NotFoundException('Process step not found')

      const clockType = step.is_business_days
        ? 'business_days'
        : 'calendar_hours'
      const targetValue = step.is_business_days
        ? step.sla_days
        : step.sla_hours
      if (targetValue === null) {
        throw new ConflictException('Process step has no valid SLA duration')
      }

      const startedAt = command.startedAt
        ? new Date(command.startedAt)
        : new Date()
      if (task.started_at && startedAt < task.started_at) {
        throw new ConflictException('Clock cannot start before task start')
      }

      const businessDays = await this.resolveTenantBusinessDays(
        transaction,
        principal.tenantId
      )
      const schedule = createSlaClockSchedule(
        slaClockDefinitionSchema.parse({
          clock_type: clockType,
          clock_scope: step.clock_scope,
          target_value: targetValue,
          started_at: startedAt,
          observe_mode: command.observeMode,
          time_zone: command.timeZone,
        }),
        businessDays
      )

      if (task.status === 'pending' || !task.started_at) {
        const [startedTask] = await transaction
          .update(taskInstances)
          .set({
            status: task.status === 'pending' ? 'in_progress' : task.status,
            started_at: task.started_at ?? schedule.started_at,
            updated_by: principal.userId,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(taskInstances.id, taskId),
              eq(taskInstances.tenant_id, principal.tenantId)
            )
          )
          .returning()
        if (!startedTask) throw new NotFoundException('Task not found')
      }

      const [created] = await transaction
        .insert(slaClocks)
        .values({
          tenant_id: principal.tenantId,
          task_instance_id: taskId,
          clock_type: schedule.clock_type,
          clock_scope: schedule.clock_scope,
          target_value: schedule.target_value,
          started_at: schedule.started_at,
          due_at: schedule.due_at,
          at_risk_at: schedule.at_risk_at,
          escalation_at: schedule.escalation_at,
          observe_mode: schedule.observe_mode,
          created_by: principal.userId,
          updated_by: principal.userId,
        })
        .returning()
      if (!created) {
        throw new InternalServerErrorException(
          'SLA clock insert returned no record'
        )
      }

      return this.clockResult(created, new Date())
    })
  }

  async setObserveMode(
    clockId: string,
    command: SetSlaObserveModeCommand,
    principal: ErpPrincipal
  ): Promise<SlaClockResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)
      const [clock] = await transaction
        .select()
        .from(slaClocks)
        .where(
          and(
            eq(slaClocks.id, clockId),
            eq(slaClocks.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!clock) throw new NotFoundException('SLA clock not found')
      if (clock.status === 'completed' || clock.status === 'cancelled') {
        throw new ConflictException('Cannot change terminal SLA clock')
      }

      const [updated] = await transaction
        .update(slaClocks)
        .set({
          observe_mode: command.observeMode,
          updated_by: principal.userId,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(slaClocks.id, clockId),
            eq(slaClocks.tenant_id, principal.tenantId)
          )
        )
        .returning()
      if (!updated) throw new NotFoundException('SLA clock not found')
      return this.clockResult(updated, new Date())
    })
  }

  async evaluateClock(
    clockId: string,
    command: EvaluateSlaClockCommand,
    principal: ErpPrincipal
  ): Promise<SlaClockResult> {
    return this.database.client.transaction(async (transaction) => {
      await this.audit.stampActor(transaction, principal)
      const [clock] = await transaction
        .select()
        .from(slaClocks)
        .where(
          and(
            eq(slaClocks.id, clockId),
            eq(slaClocks.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!clock) throw new NotFoundException('SLA clock not found')

      const now = command.now ? new Date(command.now) : new Date()
      if (
        clock.status === 'completed' ||
        clock.status === 'cancelled' ||
        clock.status === 'paused'
      ) {
        return this.clockResult(clock, now)
      }

      const evaluation = evaluateSlaClock(
        {
          clock_type: clock.clock_type,
          clock_scope: clock.clock_scope,
          target_value: clock.target_value,
          observe_mode: clock.observe_mode,
          started_at: clock.started_at,
          at_risk_at: clock.at_risk_at,
          due_at: clock.due_at,
          escalation_at: clock.escalation_at,
        },
        now
      )

      const nextStatus = evaluation.should_escalate
        ? 'escalated'
        : evaluation.is_breached && clock.status === 'running'
          ? 'breached'
          : clock.status
      const statusChanged = nextStatus !== clock.status
      const timestampsChanged =
        (evaluation.is_breached && clock.breached_at === null) ||
        (evaluation.should_escalate && clock.escalated_at === null)
      if (!statusChanged && !timestampsChanged) {
        return this.clockResult(clock, now)
      }

      const [updated] = await transaction
        .update(slaClocks)
        .set({
          status: nextStatus,
          breached_at:
            clock.breached_at ??
            (evaluation.is_breached ? now : null),
          escalated_at:
            clock.escalated_at ??
            (evaluation.should_escalate ? now : null),
          updated_by: principal.userId,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(slaClocks.id, clockId),
            eq(slaClocks.tenant_id, principal.tenantId)
          )
        )
        .returning()
      if (!updated) throw new NotFoundException('SLA clock not found')
      return this.clockResult(updated, now)
    })
  }

  async health(principal: ErpPrincipal): Promise<ProcessHealthResult> {
    const [tasks, clocks] = await Promise.all([
      this.database.client
        .select({
          responsibleBu: processSteps.responsible_bu,
          status: taskInstances.status,
        })
        .from(taskInstances)
        .innerJoin(
          processSteps,
          and(
            eq(taskInstances.process_step_id, processSteps.id),
            eq(taskInstances.tenant_id, processSteps.tenant_id)
          )
        )
        .where(eq(taskInstances.tenant_id, principal.tenantId)),
      this.database.client
        .select({
          responsibleBu: processSteps.responsible_bu,
          clockType: slaClocks.clock_type,
          clockScope: slaClocks.clock_scope,
          targetValue: slaClocks.target_value,
          status: slaClocks.status,
          startedAt: slaClocks.started_at,
          atRiskAt: slaClocks.at_risk_at,
          dueAt: slaClocks.due_at,
          escalationAt: slaClocks.escalation_at,
          observeMode: slaClocks.observe_mode,
        })
        .from(slaClocks)
        .innerJoin(
          taskInstances,
          and(
            eq(slaClocks.task_instance_id, taskInstances.id),
            eq(slaClocks.tenant_id, taskInstances.tenant_id)
          )
        )
        .innerJoin(
          processSteps,
          and(
            eq(taskInstances.process_step_id, processSteps.id),
            eq(taskInstances.tenant_id, processSteps.tenant_id)
          )
        )
        .where(eq(slaClocks.tenant_id, principal.tenantId)),
    ])

    const byBu = new Map<string, HealthCounter>()
    const counterFor = (responsibleBu: string): HealthCounter => {
      const existing = byBu.get(responsibleBu)
      if (existing) return existing
      const created: HealthCounter = {
        openTasks: 0,
        atRiskClocks: 0,
        breachedClocks: 0,
        escalatedClocks: 0,
        externalBreachedClocks: 0,
      }
      byBu.set(responsibleBu, created)
      return created
    }

    for (const task of tasks) {
      if (task.status !== 'completed' && task.status !== 'cancelled') {
        counterFor(task.responsibleBu).openTasks += 1
      }
    }

    const now = new Date()
    for (const clock of clocks) {
      if (
        clock.status === 'completed' ||
        clock.status === 'cancelled' ||
        clock.status === 'paused'
      ) {
        continue
      }
      const counter = counterFor(clock.responsibleBu)
      const evaluation = evaluateSlaClock(
        {
          clock_type: clock.clockType,
          clock_scope: clock.clockScope,
          target_value: clock.targetValue,
          observe_mode: clock.observeMode,
          started_at: clock.startedAt,
          at_risk_at: clock.atRiskAt,
          due_at: clock.dueAt,
          escalation_at: clock.escalationAt,
        },
        now
      )
      if (evaluation.is_at_risk && !evaluation.is_breached) {
        counter.atRiskClocks += 1
      }
      if (evaluation.is_breached) {
        counter.breachedClocks += 1
        if (clock.clockScope === 'external') {
          counter.externalBreachedClocks += 1
        }
      }
      if (evaluation.should_escalate || clock.status === 'escalated') {
        counter.escalatedClocks += 1
      }
    }

    const observeModes = clocks.map((clock) => clock.observeMode)
    return {
      tenantId: principal.tenantId,
      observeMode: observeModes.length === 0 || observeModes.every(Boolean),
      byBu: [...byBu.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([responsibleBu, counter]) => ({
          responsibleBu,
          ...counter,
        })),
      generatedAt: new Date().toISOString(),
    }
  }

  private async assertTenantUser(
    transaction: DatabaseTransaction,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const [user] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenant_id, tenantId)))
      .limit(1)
    if (!user) throw new NotFoundException('Assigned user not found')
  }

  private async resolveTenantBusinessDays(
    transaction: DatabaseTransaction,
    tenantId: string
  ): Promise<BusinessDayService | undefined> {
    if (process.env.BUSINESS_CALENDAR_DB_ENABLED !== '1') return undefined

    const rows = await transaction
      .select({
        date: businessCalendarHolidays.holiday_date,
        name: businessCalendarHolidays.name,
        kind: businessCalendarHolidays.kind,
        source: businessCalendarHolidays.source,
        is_enabled: businessCalendarHolidays.is_enabled,
      })
      .from(businessCalendarHolidays)
      .where(eq(businessCalendarHolidays.tenant_id, tenantId))
      .orderBy(asc(businessCalendarHolidays.holiday_date))

    return createBusinessDayService(
      mergeBusinessDayCalendars(
        { holidays: philippineHolidays },
        { holidays: rows.map((row) => tenantHolidayRowSchema.parse(row)) }
      )
    )
  }

  private stepResult(row: ProcessStep): ProcessStepResult {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      stage: row.stage,
      name: row.name,
      responsibleBu: row.responsible_bu,
      input: row.input,
      inputFrom: row.input_from,
      output: row.output,
      outputBy: row.output_by,
      slaDays: row.sla_days,
      slaHours: row.sla_hours,
      isBusinessDays: row.is_business_days,
      clockScope: row.clock_scope,
      templateLink: row.template_link,
      predecessorCode: row.predecessor_code,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private approvalRuleResult(row: ApprovalRule): ApprovalRuleResult {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      objectType: row.object_type,
      amountBandLow: row.amount_band_low.toString(),
      amountBandHigh: row.amount_band_high?.toString() ?? null,
      approverRole: row.approver_role,
      sequence: row.sequence,
      escalationAfterDays: row.escalation_after_days,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private approvalResult(row: Approval): ApprovalResult {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      objectType: row.object_type,
      objectId: row.object_id,
      approvalRuleId: row.approval_rule_id,
      sequence: row.sequence,
      approverUserId: row.approver_user_id,
      status: row.status,
      requestedAt: row.requested_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
      decisionNote: row.decision_note,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private taskResult(row: TaskInstance): TaskInstanceResult {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      processStepId: row.process_step_id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      instanceKey: row.instance_key,
      assignedTo: row.assigned_to,
      status: row.status,
      blockedReason: row.blocked_reason,
      startedAt: row.started_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }

  private clockResult(row: SlaClock, now: Date): SlaClockResult {
    const evaluation = evaluateSlaClock(
      {
        clock_type: row.clock_type,
        clock_scope: row.clock_scope,
        target_value: row.target_value,
        observe_mode: row.observe_mode,
        started_at: row.started_at,
        at_risk_at: row.at_risk_at,
        due_at: row.due_at,
        escalation_at: row.escalation_at,
      },
      now
    )
    return {
      id: row.id,
      tenantId: row.tenant_id,
      taskInstanceId: row.task_instance_id,
      clockType: row.clock_type,
      clockScope: row.clock_scope,
      targetValue: row.target_value,
      startedAt: row.started_at.toISOString(),
      dueAt: row.due_at.toISOString(),
      atRiskAt: row.at_risk_at.toISOString(),
      escalationAt: row.escalation_at?.toISOString() ?? null,
      breachedAt: row.breached_at?.toISOString() ?? null,
      escalatedAt: row.escalated_at?.toISOString() ?? null,
      pausedReason: row.paused_reason,
      status: row.status,
      observeMode: row.observe_mode,
      phase: evaluation.phase,
      isAtRisk: evaluation.is_at_risk,
      isBreached: evaluation.is_breached,
      shouldEscalate: evaluation.should_escalate,
      updatedAt: row.updated_at.toISOString(),
    }
  }
}
