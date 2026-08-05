import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  FinanceCashQuery,
  FinanceCashResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { FinanceCashPipe } from './finance-cash.pipe'
import { FinanceCashService } from './finance-cash.service'

@Controller('v1/finance/cash-transactions')
export class FinanceCashController {
  constructor(
    @Inject(FinanceCashService)
    private readonly cash: FinanceCashService
  ) {}

  @Get()
  @RequireCapabilities('finance.read')
  list(
    @Query(new FinanceCashPipe()) query: FinanceCashQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<FinanceCashResult> {
    return this.cash.list(query, principal)
  }
}
