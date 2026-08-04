import { Controller, Get, Inject } from '@nestjs/common'
import type { InventorySummaryResult } from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventorySummaryService } from './inventory-summary.service'

@Controller('v1/inventory')
export class InventorySummaryController {
  constructor(
    @Inject(InventorySummaryService)
    private readonly inventory: InventorySummaryService
  ) {}

  @Get('summary')
  @RequireCapabilities('inventory.read')
  read(
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventorySummaryResult> {
    return this.inventory.read(principal)
  }
}
