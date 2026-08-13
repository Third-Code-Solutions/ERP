import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  CortexBriefQuery,
  CortexBriefResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexBriefPipe } from './cortex-brief.pipe'
import { CortexBriefService } from './cortex-brief.service'

@Controller('v1/cortex')
export class CortexBriefController {
  constructor(
    @Inject(CortexBriefService)
    private readonly cortex: CortexBriefService
  ) {}

  @Get('brief')
  @RequireCapabilities('cortex.search')
  brief(
    @Query(new CortexBriefPipe()) query: CortexBriefQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexBriefResult> {
    return this.cortex.read(query, principal)
  }
}
