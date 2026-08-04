import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common'
import type {
  InventoryWarehouseUpdateResult,
  UpdateInventoryWarehouseCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryWarehouseUpdatePipe } from './inventory-warehouse-update.pipe'
import { InventoryWarehouseUpdateService } from './inventory-warehouse-update.service'

@Controller('v1/inventory/warehouses')
export class InventoryWarehouseUpdateController {
  constructor(
    @Inject(InventoryWarehouseUpdateService)
    private readonly warehouses: InventoryWarehouseUpdateService
  ) {}

  @Patch(':warehouseId')
  @RequireCapabilities('inventory.manage')
  update(
    @Param('warehouseId', new ParseUUIDPipe()) warehouseId: string,
    @Body(InventoryWarehouseUpdatePipe) command: UpdateInventoryWarehouseCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventoryWarehouseUpdateResult> {
    return this.warehouses.update(warehouseId, command, principal)
  }
}
