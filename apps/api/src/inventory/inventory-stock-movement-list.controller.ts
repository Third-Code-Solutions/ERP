import { Controller, Get, Inject, Query } from '@nestjs/common'
import type {
  InventoryStockMovementListQuery,
  InventoryStockMovementListResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryStockMovementListPipe } from './inventory-stock-movement-list.pipe'
import { InventoryStockMovementListService } from './inventory-stock-movement-list.service'

@Controller('v1/inventory/stock-movements')
export class InventoryStockMovementListController {
  constructor(
    @Inject(InventoryStockMovementListService)
    private readonly movements: InventoryStockMovementListService
  ) {}

  @Get()
  @RequireCapabilities('inventory.read')
  list(
    @Query(new InventoryStockMovementListPipe())
    query: InventoryStockMovementListQuery,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<InventoryStockMovementListResult> {
    return this.movements.list(query, principal)
  }
}
