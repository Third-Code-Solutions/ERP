import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common'
import type {
  CreateInventoryWarehouseCommand,
  InventoryWarehouseCreationResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryWarehouseCreatePipe } from './inventory-warehouse-create.pipe'
import { InventoryWarehouseCreationService } from './inventory-warehouse-creation.service'

@Controller('v1/inventory/warehouses')
export class InventoryWarehouseController {
  constructor(
    @Inject(InventoryWarehouseCreationService)
    private readonly warehouses: InventoryWarehouseCreationService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('inventory.manage')
  create(
    @Body(InventoryWarehouseCreatePipe) command: CreateInventoryWarehouseCommand,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventoryWarehouseCreationResult> {
    return this.warehouses.create(command, principal)
  }
}
