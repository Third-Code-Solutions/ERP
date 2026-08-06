import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common'
import type {
  AssetListQuery,
  AssetListResult,
  AssetReadResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { AssetListPipe } from './asset-list.pipe'
import { AssetsService } from './assets.service'

@Controller('v1/assets')
export class AssetsController {
  constructor(
    @Inject(AssetsService)
    private readonly assets: AssetsService
  ) {}

  @Get()
  @RequireCapabilities('asset.read')
  list(
    @Query(new AssetListPipe()) query: AssetListQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AssetListResult> {
    return this.assets.list(query, principal)
  }

  @Get(':assetId')
  @RequireCapabilities('asset.read')
  get(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AssetReadResult> {
    return this.assets.get(assetId, principal)
  }
}
