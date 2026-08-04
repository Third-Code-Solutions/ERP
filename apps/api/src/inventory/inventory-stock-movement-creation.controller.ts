import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common'
import type {
  CreateStockMovementCommand,
  StockMovementCreationResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { InventoryStockMovementCreatePipe } from './inventory-stock-movement-create.pipe'
import { InventoryStockMovementCreationService } from './inventory-stock-movement-creation.service'

@Controller('v1/inventory/stock-movements')
export class InventoryStockMovementCreationController {
  constructor(
    @Inject(InventoryStockMovementCreationService)
    private readonly stockMovements: InventoryStockMovementCreationService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('inventory.manage')
  create(
    @Body(InventoryStockMovementCreatePipe)
    command: CreateStockMovementCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<StockMovementCreationResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.stockMovements.create(command, principal, idempotencyKey.trim())
  }
}
