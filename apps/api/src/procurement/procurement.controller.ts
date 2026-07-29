import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  CreateRfqCommand,
  LogRfqQuoteCommand,
  RfqCreationResult,
  RfqDispatchResult,
  RfqTransitionResult,
  RfqQuoteResult,
  TransitionRfqCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CreateRfqPipe } from './create-rfq.pipe'
import { DispatchRfqPipe } from './dispatch-rfq.pipe'
import { LogRfqQuotePipe } from './log-rfq-quote.pipe'
import { ProcurementService } from './procurement.service'
import { RfqDispatchQueue } from './rfq-dispatch.queue'
import { TransitionRfqPipe } from './transition-rfq.pipe'

@Controller('v1/procurement/rfqs')
export class ProcurementController {
  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
    @Inject(RfqDispatchQueue)
    private readonly dispatchQueue: RfqDispatchQueue
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('rfq.dispatch')
  create(
    @Body(CreateRfqPipe) command: CreateRfqCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<RfqCreationResult> {
    return this.procurement.create(command, principal)
  }

  @Post('dispatch')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequireCapabilities('rfq.dispatch')
  dispatch(
    @Body(DispatchRfqPipe) command: CreateRfqCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<RfqDispatchResult> {
    return this.dispatchQueue.enqueue(command, principal)
  }

  @Post(':rfqId/quotes')
  @RequireCapabilities('rfq.dispatch')
  logQuote(
    @Param('rfqId', new ParseUUIDPipe()) rfqId: string,
    @Body(LogRfqQuotePipe) command: LogRfqQuoteCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<RfqQuoteResult> {
    return this.procurement.logQuote(rfqId, command, principal)
  }

  @Post(':rfqId/transitions')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('rfq.dispatch')
  transition(
    @Param('rfqId', new ParseUUIDPipe()) rfqId: string,
    @Body(TransitionRfqPipe) command: TransitionRfqCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<RfqTransitionResult> {
    return this.procurement.transition(rfqId, command, principal)
  }
}
