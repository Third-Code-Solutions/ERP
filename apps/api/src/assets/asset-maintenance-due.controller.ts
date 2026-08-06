import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  AssetMaintenanceDueQuery,
  AssetMaintenanceDueResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { AssetMaintenanceDuePipe } from './asset-maintenance-due.pipe'
import { AssetMaintenanceService } from './asset-maintenance.service'

@Controller('v1/assets/maintenance')
export class AssetMaintenanceDueController {
  constructor(
    @Inject(AssetMaintenanceService)
    private readonly maintenance: AssetMaintenanceService
  ) {}

  @Get('due')
  @RequireCapabilities('asset.read')
  list(
    @Query(new AssetMaintenanceDuePipe()) query: AssetMaintenanceDueQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<AssetMaintenanceDueResult> {
    return this.maintenance.maintenanceDue(query, principal)
  }
}
