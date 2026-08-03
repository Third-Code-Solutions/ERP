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
  SupplierBillReverseBody,
  SupplierBillReverseResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { SupplierBillReversePipe } from './supplier-bill-reverse.pipe'
import { SupplierBillReverseService } from './supplier-bill-reverse.service'

@Controller('v1/finance/supplier-bills')
export class SupplierBillReverseController {
  constructor(
    @Inject(SupplierBillReverseService)
    private readonly supplierBills: SupplierBillReverseService
  ) {}

  @Post(':supplierBillId/reverse')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.post')
  reverse(
    @Param('supplierBillId', new ParseUUIDPipe()) supplierBillId: string,
    @Body(SupplierBillReversePipe) body: SupplierBillReverseBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<SupplierBillReverseResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.supplierBills.reverse(
      supplierBillId,
      body,
      principal,
      idempotencyKey.trim()
    )
  }
}
