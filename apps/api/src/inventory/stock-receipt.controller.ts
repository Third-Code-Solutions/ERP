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
import type { CreateStockReceiptCommand } from '@third-code-erp/shared-types'
import type {
  StockReceiptPostCommand,
  StockReceiptPostingResult,
  StockReceiptReverseCommand,
  StockReceiptReversalResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { StockReceiptCreatePipe } from './stock-receipt-create.pipe'
import { StockReceiptCreationService } from './stock-receipt-creation.service'
import {
  StockReceiptPostPipe,
  StockReceiptReversePipe,
} from './stock-receipt-workflow.pipe'
import { StockReceiptWorkflowService } from './stock-receipt-workflow.service'

@Controller('v1/inventory/stock-receipts')
export class StockReceiptController {
  constructor(
    @Inject(StockReceiptCreationService)
    private readonly stockReceipts: StockReceiptCreationService,
    @Inject(StockReceiptWorkflowService)
    private readonly workflow: StockReceiptWorkflowService
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

  @Post(':receiptId/post')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('inventory.post_receipt')
  post(
    @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
    @Body(StockReceiptPostPipe) command: StockReceiptPostCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<StockReceiptPostingResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.post(
      receiptId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }

  @Post(':receiptId/reverse')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('inventory.post_receipt')
  reverse(
    @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
    @Body(StockReceiptReversePipe) command: StockReceiptReverseCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<StockReceiptReversalResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.reverse(
      receiptId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
