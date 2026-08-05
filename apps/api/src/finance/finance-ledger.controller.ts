import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  FinanceLedgerQuery,
  FinanceLedgerResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { FinanceLedgerPipe } from './finance-ledger.pipe'
import { FinanceLedgerService } from './finance-ledger.service'

@Controller('v1/finance/ledger')
export class FinanceLedgerController {
  constructor(
    @Inject(FinanceLedgerService)
    private readonly ledger: FinanceLedgerService
  ) {}

  @Get()
  @RequireCapabilities('finance.read')
  list(
    @Query(new FinanceLedgerPipe()) query: FinanceLedgerQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<FinanceLedgerResult> {
    return this.ledger.list(query, principal)
  }
}
