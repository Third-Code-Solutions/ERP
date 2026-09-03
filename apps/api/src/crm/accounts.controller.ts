import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import type {
  AccountDetailResult,
  AccountKycQueueResult,
  AccountListQuery,
  AccountListResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { AccountListPipe } from './account-list.pipe'
import { AccountsService } from './accounts.service'

@Controller('v1/crm/accounts')
export class AccountsController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService
  ) {}

  @Get()
  @RequireCapabilities('account.read')
  list(
    @Query(new AccountListPipe()) query: AccountListQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AccountListResult> {
    return this.accounts.list(query, principal)
  }

  @Get('kyc-queue')
  @RequireCapabilities('account.kyc.read')
  kycQueue(
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AccountKycQueueResult> {
    return this.accounts.kycQueue(principal)
  }

  @Get(':accountId')
  @RequireCapabilities('account.read')
  read(
    @Param('accountId', new ParseUUIDPipe()) accountId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AccountDetailResult> {
    return this.accounts.read(accountId, principal)
  }
}
