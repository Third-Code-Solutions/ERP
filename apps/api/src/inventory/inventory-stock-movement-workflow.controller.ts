import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  StockMovementPostCommand,
  StockMovementPostingResult,
  StockMovementReversalResult,
  StockMovementReverseCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  InventoryStockMovementPostPipe,
  InventoryStockMovementReversePipe,
} from './inventory-stock-movement-workflow.pipe'
import { InventoryStockMovementWorkflowService } from './inventory-stock-movement-workflow.service'

@Controller('v1/inventory/stock-movements')
export class InventoryStockMovementWorkflowController {
  constructor(
    @Inject(InventoryStockMovementWorkflowService)
    private readonly workflow: InventoryStockMovementWorkflowService
  ) {}

  @Post(':stockMovementId/post')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('inventory.post_movement')
  post(
    @Param('stockMovementId', new ParseUUIDPipe()) stockMovementId: string,
    @Body(InventoryStockMovementPostPipe)
    command: StockMovementPostCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<StockMovementPostingResult> {
    return this.workflow.post(
      stockMovementId,
      command,
      principal,
      this.requireIdempotencyKey(idempotencyKey)
    )
  }

  @Post(':stockMovementId/reverse')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('inventory.post_movement')
  reverse(
    @Param('stockMovementId', new ParseUUIDPipe()) stockMovementId: string,
    @Body(InventoryStockMovementReversePipe)
    command: StockMovementReverseCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<StockMovementReversalResult> {
    return this.workflow.reverse(
      stockMovementId,
      command,
      principal,
      this.requireIdempotencyKey(idempotencyKey)
    )
  }

  private requireIdempotencyKey(raw: string | undefined): string {
    if (!raw?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (raw.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return raw.trim()
  }
}
