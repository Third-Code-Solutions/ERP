import { Body, Controller, Headers, Inject, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common'
import type { DocumentUploadReserve } from '@third-code-erp/shared-types'
import type { Request } from 'express'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { DocumentUploadService } from './document-upload.service'

@Controller('v1/document-uploads')
export class DocumentUploadController {
  constructor(@Inject(DocumentUploadService) private readonly uploads: DocumentUploadService) {}

  @Post()
  @RequireCapabilities('document.manage')
  reserve(@Body() body: DocumentUploadReserve, @CurrentPrincipal() principal: ErpPrincipal, @Headers('idempotency-key') key: string) {
    return this.uploads.reserve(body, principal, key)
  }

  @Put(':id/content')
  @RequireCapabilities('document.manage')
  upload(@Param('id', new ParseUUIDPipe()) id: string, @CurrentPrincipal() principal: ErpPrincipal, @Req() request: Request) {
    return this.uploads.upload(id, principal, request)
  }
}
