import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common'
import type { JournalPostResult } from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { JournalPostService } from './journal-post.service'

@Controller('v1/finance/journals')
export class JournalPostController {
  constructor(
    @Inject(JournalPostService)
    private readonly journalPosts: JournalPostService
  ) {}

  @Post(':journalEntryId/post')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.post')
  post(
    @Param('journalEntryId', new ParseUUIDPipe()) journalEntryId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<JournalPostResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.journalPosts.post(
      journalEntryId,
      principal,
      idempotencyKey.trim()
    )
  }
}
