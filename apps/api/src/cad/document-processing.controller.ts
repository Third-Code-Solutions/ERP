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
  DocumentProcessingAccepted,
  DocumentProcessingRequest,
  DocumentProcessingStatus,
} from '@third-code-erp/shared-types'
import type { Response } from 'express'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { DocumentProcessingJobQueue } from './document-processing.queue'
import { DocumentProcessingPipe } from './document-processing.pipe'
import { DocumentProcessingService } from './document-processing.service'

@Controller()
export class DocumentProcessingController {
  constructor(
    @Inject(DocumentProcessingService)
    private readonly processing: DocumentProcessingService,
    @Inject(DocumentProcessingJobQueue)
    private readonly queue: DocumentProcessingJobQueue
  ) {}

  @Post('v1/documents/:documentId/processing-jobs')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCapabilities('document.process')
  async create(
    @Param('documentId') documentId: string,
    @Body(DocumentProcessingPipe) request: DocumentProcessingRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
    @Res({ passthrough: true }) response: Response
  ): Promise<DocumentProcessingAccepted | DocumentProcessingStatus> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }

    const result = await this.processing.create(
      documentId,
      request,
      principal,
      idempotencyKey.trim()
    )
    if (
      result.created &&
      (result.status.status === 'queued' || result.status.status === 'processing')
    ) {
      await this.queue.enqueue(result.status.jobId)
    }
    response.status(
      result.created ? HttpStatus.ACCEPTED : HttpStatus.OK
    )
    if (result.status.status === 'queued') {
      return {
        jobId: result.status.jobId,
        status: 'queued',
        documentId: result.status.documentId,
        createdAt: result.status.createdAt,
      }
    }
    return result.status
  }

  @Get('v1/document-processing-jobs/:jobId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('document.processing.read')
  status(
    @Param('jobId') jobId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DocumentProcessingStatus> {
    return this.processing.status(jobId, principal)
  }
}
