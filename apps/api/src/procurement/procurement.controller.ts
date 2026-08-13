import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  AwardRfqQuoteCommand,
  CancelRfqCommand,
  CompleteRfqCommand,
  LogRfqQuoteCommand,
  RfqAwardResult,
  RfqTransitionResult,
  RfqQuoteResult,
} from '@third-code-erp/shared-types'
import {
  awardRfqQuoteCommandSchema,
  cancelRfqCommandSchema,
  completeRfqCommandSchema,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { ZodBodyPipe } from '../common/zod-body.pipe'
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

  @Post(':rfqId/quotes/:quoteId/award')
  @RequireCapabilities('rfq.dispatch')
  awardQuote(
    @Param('rfqId', new ParseUUIDPipe()) rfqId: string,
    @Param('quoteId', new ParseUUIDPipe()) quoteId: string,
    @Body(new ZodBodyPipe(awardRfqQuoteCommandSchema))
    command: AwardRfqQuoteCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<RfqAwardResult> {
    return this.procurement.awardQuote(
      rfqId,
      quoteId,
      command,
      principal
    )
  }

  @Post(':rfqId/complete')
  @RequireCapabilities('rfq.dispatch')
  complete(
    @Param('rfqId', new ParseUUIDPipe()) rfqId: string,
    @Body(new ZodBodyPipe(completeRfqCommandSchema))
    command: CompleteRfqCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<RfqTransitionResult> {
    return this.procurement.transitionRfq(
      rfqId,
      { command: 'complete', ...command },
      principal
    )
  }

  @Post(':rfqId/cancel')
  @RequireCapabilities('rfq.dispatch')
  cancel(
    @Param('rfqId', new ParseUUIDPipe()) rfqId: string,
    @Body(new ZodBodyPipe(cancelRfqCommandSchema))
    command: CancelRfqCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<RfqTransitionResult> {
    return this.procurement.transitionRfq(
      rfqId,
      { command: 'cancel', ...command },
      principal
    )
  }
}
