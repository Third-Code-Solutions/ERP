import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  DailyTaskCompletionCommand,
  DailyTaskCompletionResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { DailyTaskCompletionPipe } from './daily-task-completion.pipe'
import { DailyTaskCompletionService } from './daily-task-completion.service'

@Controller('v1/daily-tasks')
export class DailyTaskCompletionController {
  constructor(
    @Inject(DailyTaskCompletionService)
    private readonly tasks: DailyTaskCompletionService
  ) {}

  @Post(':taskId/completion')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('sd.daily_tasks')
  complete(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body(DailyTaskCompletionPipe) command: DailyTaskCompletionCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DailyTaskCompletionResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.tasks.complete(
      taskId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
