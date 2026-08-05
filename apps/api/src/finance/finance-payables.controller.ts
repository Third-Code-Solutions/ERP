import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  FinancePayablesQuery,
  FinancePayablesResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { FinancePayablesPipe } from './finance-payables.pipe'
import { FinancePayablesService } from './finance-payables.service'

@Controller('v1/finance/payables')
export class FinancePayablesController {
  constructor(
    @Inject(FinancePayablesService)
    private readonly payables: FinancePayablesService
  ) {}

  @Get()
  @RequireCapabilities('finance.read')
  list(
    @Query(new FinancePayablesPipe()) query: FinancePayablesQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<FinancePayablesResult> {
    return this.payables.list(query, principal)
  }
}
