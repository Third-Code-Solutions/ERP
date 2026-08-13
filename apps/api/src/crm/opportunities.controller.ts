import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common'
import type { OpportunityDetailResult } from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { OpportunitiesService } from './opportunities.service'

@Controller('v1/crm/opportunities')
export class OpportunitiesController {
  constructor(
    @Inject(OpportunitiesService)
    private readonly opportunities: OpportunitiesService
  ) {}

  @Get(':opportunityId')
  @RequireCapabilities('opportunity.read')
  read(
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<OpportunityDetailResult> {
    return this.opportunities.read(opportunityId, principal)
  }
}
