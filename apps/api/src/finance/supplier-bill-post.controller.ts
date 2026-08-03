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
  SupplierBillPostCommand,
  SupplierBillPostResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { SupplierBillPostPipe } from './supplier-bill-post.pipe'
import { SupplierBillPostService } from './supplier-bill-post.service'

@Controller('v1/finance/supplier-bills')
export class SupplierBillPostController {
  constructor(
    @Inject(SupplierBillPostService)
    private readonly supplierBills: SupplierBillPostService
  ) {}

  @Post(':supplierBillId/post')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.post')
  post(
    @Param('supplierBillId', new ParseUUIDPipe()) supplierBillId: string,
    @Body(SupplierBillPostPipe) command: SupplierBillPostCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<SupplierBillPostResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.supplierBills.post(
      supplierBillId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
