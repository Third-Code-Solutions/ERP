import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common'
import type {
  CortexAssistantGenerationStartCommand,
  CortexAssistantGenerationStatus,
} from '@third-code-erp/shared-types'
import type { Response } from 'express'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexAssistantGenerationStartPipe } from './cortex-assistant-generation.pipe'
import { CortexAssistantGenerationJobQueue } from './cortex-assistant-generation.queue'
import { CortexAssistantGenerationService } from './cortex-assistant-generation.service'

@Controller('v1/cortex/conversations/assistant-turns/jobs')
export class CortexAssistantGenerationController {
  constructor(
    @Inject(CortexAssistantGenerationService)
    private readonly generation: CortexAssistantGenerationService,
    @Inject(CortexAssistantGenerationJobQueue)
    private readonly queue: CortexAssistantGenerationJobQueue
  ) {}

  @Post()
  @RequireCapabilities('cortex.search')
  async start(
    @Body(CortexAssistantGenerationStartPipe)
    command: CortexAssistantGenerationStartCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-third-code-timestamp') timestamp: string | undefined,
    @Headers('x-third-code-cortex-signature') signature: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
    @Res({ passthrough: true }) response: Response
  ): Promise<CortexAssistantGenerationStatus> {
    const result = await this.generation.start(
      command,
      principal,
      idempotencyKey,
      { timestamp, signature }
    )
    if (result.enqueue || result.status.status === 'queued') {
      await this.queue.enqueue(result.status.jobId)
    }
    response.status(result.enqueue ? HttpStatus.ACCEPTED : HttpStatus.OK)
    return result.status
  }

  @Get(':jobId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('cortex.search')
  status(
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexAssistantGenerationStatus> {
    return this.generation.status(jobId, principal)
  }

  @Post(':jobId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('cortex.search')
  cancel(
    @Param('jobId', new ParseUUIDPipe({ version: '4' })) jobId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexAssistantGenerationStatus> {
    if (!idempotencyKey?.trim() || idempotencyKey.length > 256) {
      throw new BadRequestException('Valid Idempotency-Key header is required')
    }
    return this.generation.cancel(jobId, principal)
  }
}
