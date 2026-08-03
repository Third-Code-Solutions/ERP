import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type {
  CashTransactionDraftBody,
  CashTransactionDraftDeleteBody,
  CashTransactionDraftDeleteResult,
  CashTransactionDraftResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  CashTransactionDraftDeletePipe,
  CashTransactionDraftPipe,
} from './cash-draft.pipe'
import { CashDraftService } from './cash-draft.service'

@Controller('v1/finance/cash-transactions')
export class CashDraftController {
  constructor(
    @Inject(CashDraftService) private readonly drafts: CashDraftService
  ) {}

  @Post('drafts')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  save(
    @Body(CashTransactionDraftPipe) body: CashTransactionDraftBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CashTransactionDraftResult> {
    return this.drafts.save(
      body,
      principal,
      this.requireIdempotencyKey(idempotencyKey)
    )
  }

  @Delete(':cashTransactionId/draft')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  delete(
    @Param('cashTransactionId', new ParseUUIDPipe()) cashTransactionId: string,
    @Body(CashTransactionDraftDeletePipe) _body: CashTransactionDraftDeleteBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CashTransactionDraftDeleteResult> {
    return this.drafts.delete(
      cashTransactionId,
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
