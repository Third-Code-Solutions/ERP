import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common'
import type {
  InventoryStockMovementDetailResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryStockMovementDetailService } from './inventory-stock-movement-detail.service'

@Controller('v1/inventory/stock-movements')
export class InventoryStockMovementDetailController {
  constructor(
    @Inject(InventoryStockMovementDetailService)
    private readonly movements: InventoryStockMovementDetailService
  ) {}

  @Get(':movementId')
  @RequireCapabilities('inventory.read')
  read(
    @Param('movementId', new ParseUUIDPipe()) movementId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventoryStockMovementDetailResult> {
    return this.movements.read(movementId, principal)
  }
}
