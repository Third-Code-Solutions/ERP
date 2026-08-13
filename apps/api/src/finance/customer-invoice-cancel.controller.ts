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
  CustomerInvoiceCancelBody,
  CustomerInvoiceCancelResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CustomerInvoiceCancelPipe } from './customer-invoice-cancel.pipe'
import { CustomerInvoiceCancelService } from './customer-invoice-cancel.service'

@Controller('v1/finance/customer-invoices')
export class CustomerInvoiceCancelController {
  constructor(
    @Inject(CustomerInvoiceCancelService)
    private readonly invoices: CustomerInvoiceCancelService
  ) {}

  @Post(':invoiceId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.issue_invoice')
  cancel(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body(CustomerInvoiceCancelPipe) body: CustomerInvoiceCancelBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CustomerInvoiceCancelResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.invoices.cancel(
      invoiceId,
      body,
      principal,
      idempotencyKey.trim()
    )
  }
}
