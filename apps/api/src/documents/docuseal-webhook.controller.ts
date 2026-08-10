import { timingSafeEqual } from 'node:crypto'
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  DocuSealWebhookCommand,
  DocuSealWebhookResult,
} from '@third-code-erp/shared-types'
import { Public } from '../auth/supabase-jwt.guard'
import { DocuSealWebhookPipe } from './docuseal-webhook.pipe'
import { DocuSealWebhookService } from './docuseal-webhook.service'

function matchesSecret(provided: string | undefined, expected: string): boolean {
  if (!provided || expected.length === 0) return false
  const providedBytes = Buffer.from(provided)
  const expectedBytes = Buffer.from(expected)
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  )
}
@Public()
@Controller('v1/webhooks/docuseal')
export class DocuSealWebhookController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DocuSealWebhookService)
    private readonly webhook: DocuSealWebhookService
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  receive(
    @Body(DocuSealWebhookPipe) command: DocuSealWebhookCommand,
    @Headers('x-erp-core-webhook-token') internalToken: string | undefined
  ): Promise<DocuSealWebhookResult> {
    const expected = this.config.get<string>('ERP_CORE_WEBHOOK_TOKEN', '')
    if (!matchesSecret(internalToken, expected)) {
      throw new UnauthorizedException()
    }
    return this.webhook.handle(command)
  }
}
