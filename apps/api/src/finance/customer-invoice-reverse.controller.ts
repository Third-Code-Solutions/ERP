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
  CustomerInvoiceReverseBody,
  CustomerInvoiceReverseResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CustomerInvoiceReversePipe } from './customer-invoice-reverse.pipe'
import { CustomerInvoiceReverseService } from './customer-invoice-reverse.service'

@Controller('v1/finance/customer-invoices')
export class CustomerInvoiceReverseController {
  constructor(
    @Inject(CustomerInvoiceReverseService)
    private readonly invoices: CustomerInvoiceReverseService
  ) {}

  @Post(':invoiceId/reverse')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.issue_invoice')
  reverse(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body(CustomerInvoiceReversePipe) body: CustomerInvoiceReverseBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CustomerInvoiceReverseResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.invoices.reverse(
      invoiceId,
      body,
      principal,
      idempotencyKey.trim()
    )
  }
}
