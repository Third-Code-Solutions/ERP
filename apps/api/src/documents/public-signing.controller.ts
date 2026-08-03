import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import type {
  PublicSigningBody,
  PublicSigningResult,
} from '@third-code-erp/shared-types'
import { Public } from '../auth/supabase-jwt.guard'
import { PublicSigningPipe } from './public-signing.pipe'
import { PublicSigningService } from './public-signing.service'

@Public()
@Controller('v1/public/signatures')
export class PublicSigningController {
  constructor(private readonly signing: PublicSigningService) {}

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  sign(
    @Param('token') token: string,
    @Body(PublicSigningPipe) body: PublicSigningBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ): Promise<PublicSigningResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.trim().length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.signing.sign(token, body, idempotencyKey.trim())
  }
}
