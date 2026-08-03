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
  VendorConfirmationBody,
  VendorConfirmationResult,
} from '@third-code-erp/shared-types'
import { Public } from '../auth/supabase-jwt.guard'
import { PublicVendorConfirmationPipe } from './public-vendor-confirmation.pipe'
import { PublicVendorConfirmationService } from './public-vendor-confirmation.service'

@Public()
@Controller('v1/public/purchase-orders')
export class PublicVendorConfirmationController {
  constructor(private readonly confirmations: PublicVendorConfirmationService) {}

  @Post(':token/confirmation')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('token') token: string,
    @Body(PublicVendorConfirmationPipe) body: VendorConfirmationBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ): Promise<VendorConfirmationResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.trim().length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.confirmations.confirm(token, body, idempotencyKey.trim())
  }
}
