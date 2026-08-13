import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  CortexSearchQuery,
  CortexSearchResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CortexSearchPipe } from './cortex-search.pipe'
import { CortexSearchService } from './cortex-search.service'

@Controller('v1/cortex')
export class CortexSearchController {
  constructor(
    @Inject(CortexSearchService)
    private readonly cortex: CortexSearchService
  ) {}

  @Get('search')
  @RequireCapabilities('cortex.search')
  search(
    @Query(new CortexSearchPipe()) query: CortexSearchQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CortexSearchResult> {
    return this.cortex.search(query, principal)
  }
}
