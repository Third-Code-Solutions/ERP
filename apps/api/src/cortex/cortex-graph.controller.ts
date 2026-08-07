import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  CortexGraphQuery,
  CortexGraphResponse,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexGraphPipe } from './cortex-graph.pipe'
import { CortexGraphService } from './cortex-graph.service'

@Controller('v1/cortex')
export class CortexGraphController {
  constructor(
    @Inject(CortexGraphService)
    private readonly cortex: CortexGraphService
  ) {}

  @Get('graph')
  @RequireCapabilities('cortex.search')
  graph(
    @Query(new CortexGraphPipe()) query: CortexGraphQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexGraphResponse> {
    return this.cortex.read(query, principal)
  }
}
