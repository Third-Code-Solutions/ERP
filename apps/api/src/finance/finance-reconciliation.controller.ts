import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  FinanceReconciliationQuery,
  FinanceReconciliationResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { FinanceReconciliationPipe } from './finance-reconciliation.pipe'
import { FinanceReconciliationService } from './finance-reconciliation.service'

@Controller('v1/finance/reconciliation')
export class FinanceReconciliationController {
  constructor(
    @Inject(FinanceReconciliationService)
    private readonly reconciliation: FinanceReconciliationService
  ) {}

  @Get()
  @RequireCapabilities('finance.read')
  list(
    @Query(new FinanceReconciliationPipe()) query: FinanceReconciliationQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<FinanceReconciliationResult> {
    return this.reconciliation.list(query, principal)
  }
}
