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
  CustomerInvoiceIssueCommand,
  CustomerInvoiceIssueResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CustomerInvoiceIssuePipe } from './customer-invoice-issue.pipe'
import { CustomerInvoiceIssueService } from './customer-invoice-issue.service'

@Controller('v1/finance/customer-invoices')
export class CustomerInvoiceIssueController {
  constructor(
    @Inject(CustomerInvoiceIssueService)
    private readonly invoices: CustomerInvoiceIssueService
  ) {}

  @Post(':invoiceId/issue')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('finance.issue_invoice')
  issue(
    @Param('invoiceId', new ParseUUIDPipe()) invoiceId: string,
    @Body(CustomerInvoiceIssuePipe) command: CustomerInvoiceIssueCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CustomerInvoiceIssueResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.invoices.issue(
      invoiceId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
