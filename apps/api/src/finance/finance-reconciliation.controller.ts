import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common'
import type {
  FinanceReconciliationDetailResult,
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

  @Get(':statementId')
  @RequireCapabilities('finance.read')
  read(
    @Param('statementId', new ParseUUIDPipe()) statementId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<FinanceReconciliationDetailResult> {
    return this.reconciliation.read(statementId, principal)
  }
}
