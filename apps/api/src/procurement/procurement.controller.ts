import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  LogRfqQuoteCommand,
  RfqQuoteResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { LogRfqQuotePipe } from './log-rfq-quote.pipe'
import { ProcurementService } from './procurement.service'

@Controller('v1/procurement/rfqs')
export class ProcurementController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService
  ) {}

  @Post(':rfqId/quotes')
  @RequireCapabilities('rfq.dispatch')
  logQuote(
    @Param('rfqId', new ParseUUIDPipe()) rfqId: string,
    @Body(LogRfqQuotePipe) command: LogRfqQuoteCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<RfqQuoteResult> {
    return this.procurement.logQuote(rfqId, command, principal)
  }
}
