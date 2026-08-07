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
  CustomerInvoiceDraftCreateBody,
  CustomerInvoiceDraftCreateResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CustomerInvoiceDraftCreatePipe } from './customer-invoice-draft-create.pipe'
import { CustomerInvoiceDraftCreateService } from './customer-invoice-draft-create.service'

@Controller('v1/projects')
export class CustomerInvoiceDraftCreateController {
  constructor(
    @Inject(CustomerInvoiceDraftCreateService)
    private readonly invoices: CustomerInvoiceDraftCreateService
  ) {}

  @Post(':projectId/customer-invoices')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('finance.issue_invoice')
  create(
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body(CustomerInvoiceDraftCreatePipe) body: CustomerInvoiceDraftCreateBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<CustomerInvoiceDraftCreateResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.invoices.create(
      projectId,
      body,
      principal,
      idempotencyKey.trim()
    )
  }
}
