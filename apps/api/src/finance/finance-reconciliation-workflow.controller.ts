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
  BankStatementAutoMatchBody,
  BankStatementAutoMatchResult,
  BankStatementLineMatchBody,
  BankStatementLineMatchResult,
  BankStatementLineUnmatchBody,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  FinanceReconciliationAutoMatchPipe,
  FinanceReconciliationLineMatchPipe,
  FinanceReconciliationLineUnmatchPipe,
} from './finance-reconciliation-workflow.pipe'
import { FinanceReconciliationWorkflowService } from './finance-reconciliation-workflow.service'

@Controller('v1/finance/reconciliation')
export class FinanceReconciliationWorkflowController {
  constructor(
    @Inject(FinanceReconciliationWorkflowService)
    private readonly reconciliation: FinanceReconciliationWorkflowService
  ) {}

  @Post(':statementId/auto-match')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  autoMatch(
    @Param('statementId', new ParseUUIDPipe()) statementId: string,
    @Body(FinanceReconciliationAutoMatchPipe) body: BankStatementAutoMatchBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<BankStatementAutoMatchResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.reconciliation.autoMatch(
      statementId,
      body,
      principal,
      idempotencyKey.trim()
    )
  }

  @Post(':statementId/lines/:lineId/match')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  matchLine(
    @Param('statementId', new ParseUUIDPipe()) statementId: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
    @Body(FinanceReconciliationLineMatchPipe) body: BankStatementLineMatchBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<BankStatementLineMatchResult> {
    return this.reconciliation.matchLine(
      statementId,
      lineId,
      body,
      principal,
      this.requireIdempotencyKey(idempotencyKey)
    )
  }

  @Post(':statementId/lines/:lineId/unmatch')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.manage_cash')
  unmatchLine(
    @Param('statementId', new ParseUUIDPipe()) statementId: string,
    @Param('lineId', new ParseUUIDPipe()) lineId: string,
    @Body(FinanceReconciliationLineUnmatchPipe)
    body: BankStatementLineUnmatchBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<BankStatementLineMatchResult> {
    return this.reconciliation.unmatchLine(
      statementId,
      lineId,
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
