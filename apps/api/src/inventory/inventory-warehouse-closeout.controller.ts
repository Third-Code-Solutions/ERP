import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common'
import type { InventoryWarehouseCloseoutResult } from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryWarehouseCloseoutService } from './inventory-warehouse-closeout.service'

@Controller('v1/inventory/warehouses')
export class InventoryWarehouseCloseoutController {
  constructor(
    @Inject(InventoryWarehouseCloseoutService)
    private readonly closeout: InventoryWarehouseCloseoutService
  ) {}

  @Get(':warehouseId/closeout')
  @RequireCapabilities('inventory.manage')
  read(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventoryWarehouseCloseoutResult> {
    return this.closeout.read(warehouseId, principal)
  }
}
