import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Inject,
  Post,
  Res,
} from '@nestjs/common'
import { z } from 'zod'
import type { Response } from 'express'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import {
  PROVIDER_QUOTA_BUCKETS,
  type ProviderQuotaBucket,
  type ProviderQuotaDecision,
  ProviderQuotaService,
} from './provider-quota.service'

const requestSchema = z.object({
  bucket: z.enum(PROVIDER_QUOTA_BUCKETS),
}).strict()

export type ProviderQuotaResponse = ProviderQuotaDecision

@Controller('v1/provider-quotas')
export class ProviderQuotaController {
  constructor(
    @Inject(ProviderQuotaService)
    private readonly quota: ProviderQuotaService
  ) {}

  @Post('consume')
  @RequireCapabilities('provider.quota.consume')
  async consume(
    @Body() body: unknown,
    @CurrentPrincipal() principal: ErpPrincipal,
    @Res({ passthrough: true }) response: Response
  ): Promise<ProviderQuotaResponse> {
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      throw new BadRequestException('Invalid provider quota bucket')
    }

    const decision = await this.quota.consume(
      parsed.data.bucket as ProviderQuotaBucket,
      principal
    )
    if (!decision.allowed) {
      response.status(HttpStatus.TOO_MANY_REQUESTS)
      response.setHeader('Retry-After', String(decision.retryAfterSeconds))
      response.setHeader('X-RateLimit-Limit', String(decision.limit))
      response.setHeader('X-RateLimit-Scope', decision.scope)
    }
    return decision
  }
}
