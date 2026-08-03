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
  CashTransactionPostBody,
  CashTransactionPostResult,
  CashTransactionReverseBody,
  CashTransactionReverseResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CashTransactionPostPipe,
  CashTransactionReversePipe,
} from './cash-transaction-workflow.pipe'
import { CashTransactionWorkflowService } from './cash-transaction-workflow.service'

@Controller('v1/finance/cash-transactions')
export class CashTransactionWorkflowController {
  constructor(
    @Inject(CashTransactionWorkflowService)
    private readonly cashTransactions: CashTransactionWorkflowService
  ) {}

  @Post(':cashTransactionId/post')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  post(
    @Param('cashTransactionId', new ParseUUIDPipe()) cashTransactionId: string,
    @Body(CashTransactionPostPipe) body: CashTransactionPostBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CashTransactionPostResult> {
    return this.cashTransactions.post(
      cashTransactionId,
      body,
      principal,
      this.requireIdempotencyKey(idempotencyKey)
    )
  }

  @Post(':cashTransactionId/reverse')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  reverse(
    @Param('cashTransactionId', new ParseUUIDPipe()) cashTransactionId: string,
    @Body(CashTransactionReversePipe) body: CashTransactionReverseBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CashTransactionReverseResult> {
    return this.cashTransactions.reverse(
      cashTransactionId,
      body,
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
