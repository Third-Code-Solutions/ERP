import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import type { AccountKycDocumentQuery, AccountKycDocumentResult, KycArtifactCreateCommand, KycArtifactCreateResult } from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { AccountKycDocumentQueryPipe, KycArtifactCreatePipe } from './kyc-artifact.pipe'
import { KycArtifactService } from './kyc-artifact.service'

@Controller('v1/crm/accounts')
export class KycArtifactController {
  constructor(@Inject(KycArtifactService) private readonly artifacts: KycArtifactService) {}

  @Get(':accountId/kyc-document-options')
  @RequireCapabilities('account.create')
  list(@Param('accountId', new ParseUUIDPipe()) accountId: string, @Query(AccountKycDocumentQueryPipe) query: AccountKycDocumentQuery, @CurrentPrincipal() principal: ErpPrincipal): Promise<AccountKycDocumentResult> {
    return this.artifacts.list(accountId, query, principal)
  }

  @Post(':accountId/kyc-artifacts')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('account.create')
  create(@Param('accountId', new ParseUUIDPipe()) accountId: string, @Body(KycArtifactCreatePipe) command: KycArtifactCreateCommand, @CurrentPrincipal() principal: ErpPrincipal): Promise<KycArtifactCreateResult> {
    return this.artifacts.create(accountId, command, principal)
  }
}
