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
import type { CreateStockReceiptCommand } from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { StockReceiptCreatePipe } from './stock-receipt-create.pipe'
import { StockReceiptCreationService } from './stock-receipt-creation.service'

@Controller('v1/inventory/stock-receipts')
export class StockReceiptController {
  constructor(
    @Inject(StockReceiptCreationService)
    private readonly stockReceipts: StockReceiptCreationService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('inventory.manage')
  create(
    @Body(StockReceiptCreatePipe) command: CreateStockReceiptCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.stockReceipts.create(
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
