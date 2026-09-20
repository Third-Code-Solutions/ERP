import { Body, Controller, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import type { ClaimDocumentAttachCommand, ClaimDocumentAttachResult } from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { ClaimDocumentPipe } from './claim-document.pipe'
import { ClaimDocumentService } from './claim-document.service'

@Controller('v1/claims')
export class ClaimDocumentController {
  constructor(@Inject(ClaimDocumentService) private readonly attachments: ClaimDocumentService) {}

  @Post(':claimId/documents')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('document.manage')
  attach(
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
    @Body(ClaimDocumentPipe) command: ClaimDocumentAttachCommand,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<ClaimDocumentAttachResult> {
    return this.attachments.attach(claimId, command, principal)
  }
}
