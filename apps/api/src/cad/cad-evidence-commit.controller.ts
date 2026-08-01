import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common'
import type {
  CadEvidenceCommitCommand,
  CadEvidenceCommitResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CadEvidenceCommitPipe } from './cad-evidence-commit.pipe'
import { CadEvidenceCommitService } from './cad-evidence-commit.service'

@Controller('v1/documents')
export class CadEvidenceCommitController {
  constructor(
    @Inject(CadEvidenceCommitService)
    private readonly cadEvidence: CadEvidenceCommitService
  ) {}

  @Post(':documentId/cad-evidence')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('document.manage')
  commit(
    @Param('documentId') documentId: string,
    @Body(CadEvidenceCommitPipe) command: CadEvidenceCommitCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CadEvidenceCommitResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.cadEvidence.commit(
      documentId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
