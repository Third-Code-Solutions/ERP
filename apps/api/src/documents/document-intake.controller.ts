import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
} from '@nestjs/common'
import type {
  DocumentIntakeRequest,
  DocumentIntakeResult,
} from '@third-code-erp/shared-types'
import type { Response } from 'express'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { DocumentIntakePipe } from './document-intake.pipe'
import { DocumentIntakeService } from './document-intake.service'

@Controller('v1/documents')
export class DocumentIntakeController {
  constructor(
    @Inject(DocumentIntakeService)
    private readonly intake: DocumentIntakeService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('document.manage')
  async create(
    @Body(DocumentIntakePipe) request: DocumentIntakeRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal,
    @Res({ passthrough: true }) response: Response
  ): Promise<DocumentIntakeResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }

    const result = await this.intake.create(
      request,
      principal,
      idempotencyKey.trim()
    )
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK)
    return result
  }
}
