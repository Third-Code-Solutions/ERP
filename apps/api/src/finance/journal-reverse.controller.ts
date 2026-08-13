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
  JournalReverseBody,
  JournalReverseResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { JournalReversePipe } from './journal-reverse.pipe'
import { JournalReverseService } from './journal-reverse.service'

@Controller('v1/finance/journals')
export class JournalReverseController {
  constructor(
    @Inject(JournalReverseService)
    private readonly journalReversals: JournalReverseService
  ) {}

  @Post(':journalEntryId/reverse')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.post')
  reverse(
    @Param('journalEntryId', new ParseUUIDPipe()) journalEntryId: string,
    @Body(JournalReversePipe) body: JournalReverseBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<JournalReverseResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.journalReversals.reverse(
      journalEntryId,
      body,
      principal,
      idempotencyKey.trim()
    )
  }
}
