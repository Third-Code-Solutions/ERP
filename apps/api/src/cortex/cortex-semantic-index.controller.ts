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
  Post,
  Res,
} from '@nestjs/common'
import type {
  CortexSemanticIndexAccepted,
  CortexSemanticIndexCommand,
  CortexSemanticIndexStatus,
} from '@third-code-erp/shared-types'
import type { Response } from 'express'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexSemanticIndexPipe } from './cortex-semantic-index.pipe'
import { CortexSemanticIndexJobQueue } from './cortex-semantic-index.queue'
import { CortexSemanticIndexService } from './cortex-semantic-index.service'

@Controller()
export class CortexSemanticIndexController {
  constructor(
    @Inject(CortexSemanticIndexService)
    private readonly indexing: CortexSemanticIndexService,
    @Inject(CortexSemanticIndexJobQueue)
    private readonly queue: CortexSemanticIndexJobQueue
  ) {}

  @Post('v1/cortex/semantic-index-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCapabilities('cortex.index.manage')
  async create(
    @Body(CortexSemanticIndexPipe) command: CortexSemanticIndexCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
    @Res({ passthrough: true }) response: Response
  ): Promise<CortexSemanticIndexAccepted | CortexSemanticIndexStatus> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }

    const result = await this.indexing.create(
      command,
      principal,
      idempotencyKey.trim()
    )
    if (result.status.status === 'queued') {
      await this.queue.enqueue(result.status.jobId)
    }
    response.status(
      result.created && result.status.status === 'queued'
        ? HttpStatus.ACCEPTED
        : HttpStatus.OK
    )
    if (result.status.status === 'queued') {
      return {
        jobId: result.status.jobId,
        status: 'queued',
        maxNodes: result.status.maxNodes,
        backlogAtRequest: result.status.backlogAtRequest,
        createdAt: result.status.createdAt,
      }
    }
    return result.status
  }

  @Get('v1/cortex/semantic-index-jobs/:jobId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('cortex.index.manage')
  status(
    @Param('jobId') jobId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexSemanticIndexStatus> {
    return this.indexing.status(jobId, principal)
  }
}
