import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common'
import type {
  CreatePurchaseOrderFromBomCommand,
  CreatePurchaseOrderCommand,
  PurchaseOrderWorkflowCommand,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { CreatePurchaseOrderPipe } from './create-purchase-order.pipe'
import { CreatePurchaseOrderFromBomPipe } from './create-purchase-order-from-bom.pipe'
import { PurchaseOrderCreationService } from './purchase-order-creation.service'
import { PurchaseOrderWorkflowPipe } from './purchase-order-workflow.pipe'
import { PurchaseOrderWorkflowService } from './purchase-order-workflow.service'

@Controller('v1/procurement/purchase-orders')
export class PurchaseOrderController {
  constructor(
    @Inject(PurchaseOrderCreationService)
    private readonly purchaseOrders: PurchaseOrderCreationService,
    @Inject(PurchaseOrderWorkflowService)
    private readonly workflow: PurchaseOrderWorkflowService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('po.create')
  create(
    @Body(CreatePurchaseOrderPipe) command: CreatePurchaseOrderCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ) {
    if (!idempotencyKey?.trim()) {
      // Keep header validation outside command body so tenant and actor
      // authority can never be supplied by the browser.
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.purchaseOrders.create(
      command,
      principal,
      idempotencyKey.trim()
    )
  }

  @Post('from-bom')
  @HttpCode(HttpStatus.CREATED)
  @RequireCapabilities('po.create')
  createFromBom(
    @Body(CreatePurchaseOrderFromBomPipe)
    command: CreatePurchaseOrderFromBomCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.purchaseOrders.createFromBom(
      command,
      principal,
      idempotencyKey.trim()
    )
  }

  @Post(':purchaseOrderId/workflow')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('po.create')
  workflowTransition(
    @Param('purchaseOrderId') purchaseOrderId: string,
    @Body(PurchaseOrderWorkflowPipe) command: PurchaseOrderWorkflowCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.transition(
      purchaseOrderId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
