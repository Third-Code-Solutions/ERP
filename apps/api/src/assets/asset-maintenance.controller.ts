import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  Query,
} from '@nestjs/common'
import type {
  AssetMaintenanceListQuery,
  AssetMaintenanceListResult,
  AssetMaintenanceCreationResult,
  CreateAssetMaintenanceRecordCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { AssetMaintenanceCreatePipe } from './asset-maintenance-create.pipe'
import { AssetMaintenanceListPipe } from './asset-maintenance-list.pipe'
import { AssetMaintenanceService } from './asset-maintenance.service'

@Controller('v1/assets/:assetId/maintenance')
export class AssetMaintenanceController {
  constructor(
    @Inject(AssetMaintenanceService)
    private readonly maintenance: AssetMaintenanceService
  ) {}

  @Get()
  @RequireCapabilities('asset.read')
  list(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Query(new AssetMaintenanceListPipe()) query: AssetMaintenanceListQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AssetMaintenanceListResult> {
    return this.maintenance.list(assetId, query, principal)
  }

  @Post()
  @HttpCode(201)
  @RequireCapabilities('asset.maintenance.manage')
  create(
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body(new AssetMaintenanceCreatePipe())
    command: CreateAssetMaintenanceRecordCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AssetMaintenanceCreationResult> {
    return this.maintenance.create(assetId, command, principal, idempotencyKey)
  }
}
