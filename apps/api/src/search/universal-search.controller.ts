import { Controller, Get, Inject, Query } from '@nestjs/common'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  type UniversalSearchQuery,
  type UniversalSearchResult,
} from '@third-code-erp/shared-types'
import { UniversalSearchPipe } from './universal-search.pipe'
import { UniversalSearchService } from './universal-search.service'

@Controller('v1/search')
export class UniversalSearchController {
  constructor(
    @Inject(UniversalSearchService)
    private readonly searchService: UniversalSearchService
  ) {}

  @Get()
  @RequireCapabilities('cortex.search')
  search(
    @Query(new UniversalSearchPipe()) query: UniversalSearchQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<UniversalSearchResult> {
    return this.searchService.search(query, principal)
  }
}
