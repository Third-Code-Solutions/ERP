import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common'
import type { DocumentDeleteBody, DocumentDeleteResult } from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { DocumentDeletePipe } from './document-delete.pipe'
import { DocumentDeleteService } from './document-delete.service'

@Controller('v1/documents')
export class DocumentDeleteController {
  constructor(
    @Inject(DocumentDeleteService)
    private readonly documents: DocumentDeleteService
  ) {}

  @Delete(':documentId')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('document.manage')
  delete(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(DocumentDeletePipe) _body: DocumentDeleteBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DocumentDeleteResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.trim().length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.documents.delete(documentId, principal, idempotencyKey.trim())
  }
}
