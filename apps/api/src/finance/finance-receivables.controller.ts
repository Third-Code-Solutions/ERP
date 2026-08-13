import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  FinanceReceivablesQuery,
  FinanceReceivablesResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { FinanceReceivablesPipe } from './finance-receivables.pipe'
import { FinanceReceivablesService } from './finance-receivables.service'

@Controller('v1/finance/receivables')
export class FinanceReceivablesController {
  constructor(
    @Inject(FinanceReceivablesService)
    private readonly receivables: FinanceReceivablesService
  ) {}

  @Get()
  @RequireCapabilities('finance.read')
  list(
    @Query(new FinanceReceivablesPipe()) query: FinanceReceivablesQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<FinanceReceivablesResult> {
    return this.receivables.list(query, principal)
  }
}
