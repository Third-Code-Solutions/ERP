import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common'
import type { RfqBidLevelingResult } from '@third-code-erp/shared-types'
import { RequireCapabilities } from '../auth/capability.guard'
import { CurrentPrincipal, type ErpPrincipal } from '../auth/current-principal.decorator'
import { RfqBidLevelingService } from './rfq-bid-leveling.service'

@Controller('v1/procurement/rfqs')
export class RfqBidLevelingController {
  constructor(
    @Inject(RfqBidLevelingService)
    private readonly bidLeveling: RfqBidLevelingService,
  ) {}

  @Get(':rfqId/bid-leveling')
  @RequireCapabilities('procurement.rfq_read')
  read(
    @Param('rfqId', new ParseUUIDPipe()) rfqId: string,
    @CurrentPrincipal() principal: ErpPrincipal,
  ): Promise<RfqBidLevelingResult> {
    return this.bidLeveling.read(rfqId, principal)
  }
}
