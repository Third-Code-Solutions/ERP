import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import type {
  ApprovalResult,
  ApprovalRuleResult,
  AssignTaskInstanceCommand,
  CreateApprovalCommand,
  CreateApprovalRuleCommand,
  CreateProcessStepCommand,
  CreateTaskInstanceCommand,
  DecideApprovalCommand,
  EvaluateSlaClockCommand,
  ProcessHealthResult,
  ProcessStepResult,
  ListApprovalRulesQuery,
  SetSlaObserveModeCommand,
  SlaClockResult,
  StartProcessClockCommand,
  TaskInstanceResult,
  UpdateTaskStatusCommand,
} from '@third-code-erp/shared-types'
import {
  createApprovalCommandSchema,
  createApprovalRuleCommandSchema,
  assignTaskInstanceCommandSchema,
  createProcessStepCommandSchema,
  createTaskInstanceCommandSchema,
  decideApprovalCommandSchema,
  evaluateSlaClockCommandSchema,
  listApprovalRulesQuerySchema,
  setSlaObserveModeCommandSchema,
  startProcessClockCommandSchema,
  updateTaskStatusCommandSchema,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { ZodBodyPipe } from '../common/zod-body.pipe'
import { ZodQueryPipe } from '../common/zod-query.pipe'
import { ProcessService } from './process.service'

@Controller('v1/process')
export class ProcessController {
  constructor(
    @Inject(ProcessService)
    private readonly process: ProcessService
  ) {}

  @Get('steps')
  @RequireCapabilities('process.health.read')
  listSteps(
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProcessStepResult[]> {
    return this.process.listSteps(principal)
  }

  @Post('steps')
  @RequireCapabilities('process.step.manage')
  createStep(
    @Body(new ZodBodyPipe(createProcessStepCommandSchema))
    command: CreateProcessStepCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProcessStepResult> {
    return this.process.createStep(command, principal)
  }

  @Post('tasks')
  @RequireCapabilities('process.task.manage')
  createTask(
    @Body(new ZodBodyPipe(createTaskInstanceCommandSchema))
    command: CreateTaskInstanceCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<TaskInstanceResult> {
    return this.process.createTask(command, principal)
  }

  @Get('approval-rules')
  @RequireCapabilities('process.health.read')
  listApprovalRules(
    @Query(new ZodQueryPipe(listApprovalRulesQuerySchema))
    query: ListApprovalRulesQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ApprovalRuleResult[]> {
    return this.process.listApprovalRules(principal, query.objectType)
  }

  @Post('approval-rules')
  @RequireCapabilities('process.approval.manage')
  createApprovalRule(
    @Body(new ZodBodyPipe(createApprovalRuleCommandSchema))
    command: CreateApprovalRuleCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ApprovalRuleResult> {
    return this.process.createApprovalRule(command, principal)
  }

  @Post('approvals')
  @RequireCapabilities('process.approval.manage')
  createApproval(
    @Body(new ZodBodyPipe(createApprovalCommandSchema))
    command: CreateApprovalCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ApprovalResult> {
    return this.process.createApproval(command, principal)
  }

  @Patch('approvals/:approvalId/decision')
  @RequireCapabilities('process.approval.manage')
  decideApproval(
    @Param('approvalId', new ParseUUIDPipe()) approvalId: string,
    @Body(new ZodBodyPipe(decideApprovalCommandSchema))
    command: DecideApprovalCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ApprovalResult> {
    return this.process.decideApproval(approvalId, command, principal)
  }

  @Patch('tasks/:taskId/assignment')
  @RequireCapabilities('process.task.manage')
  assignTask(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(new ZodBodyPipe(assignTaskInstanceCommandSchema))
    command: AssignTaskInstanceCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<TaskInstanceResult> {
    return this.process.assignTask(taskId, command, principal)
  }

  @Patch('tasks/:taskId/status')
  @RequireCapabilities('process.task.manage')
  updateTaskStatus(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(new ZodBodyPipe(updateTaskStatusCommandSchema))
    command: UpdateTaskStatusCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<TaskInstanceResult> {
    return this.process.updateTaskStatus(taskId, command, principal)
  }

  @Post('tasks/:taskId/clock')
  @RequireCapabilities('process.task.manage')
  startClock(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(new ZodBodyPipe(startProcessClockCommandSchema))
    command: StartProcessClockCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<SlaClockResult> {
    return this.process.startClock(taskId, command, principal)
  }

  @Patch('sla-clocks/:clockId/observe-mode')
  @RequireCapabilities('process.sla.manage')
  setObserveMode(
    @Param('clockId', new ParseUUIDPipe()) clockId: string,
    @Body(new ZodBodyPipe(setSlaObserveModeCommandSchema))
    command: SetSlaObserveModeCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<SlaClockResult> {
    return this.process.setObserveMode(clockId, command, principal)
  }

  @Post('sla-clocks/:clockId/evaluate')
  @RequireCapabilities('process.sla.manage')
  evaluateClock(
    @Param('clockId', new ParseUUIDPipe()) clockId: string,
    @Body(new ZodBodyPipe(evaluateSlaClockCommandSchema))
    command: EvaluateSlaClockCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<SlaClockResult> {
    return this.process.evaluateClock(clockId, command, principal)
  }

  @Get('health')
  @RequireCapabilities('process.health.read')
  health(
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<ProcessHealthResult> {
    return this.process.health(principal)
  }
}
