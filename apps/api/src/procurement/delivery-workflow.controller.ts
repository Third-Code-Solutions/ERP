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
  DeliveryReceiptCommand,
  DeliveryReceiptResult,
  DeliveryStartInspectionCommand,
  DeliveryStartInspectionResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { DeliveryReceiptPipe } from './delivery-receipt.pipe'
import { DeliveryStartInspectionPipe } from './delivery-start-inspection.pipe'
import { DeliveryWorkflowService } from './delivery-workflow.service'

@Controller('v1/procurement/deliveries')
export class DeliveryWorkflowController {
  constructor(
    @Inject(DeliveryWorkflowService)
    private readonly workflow: DeliveryWorkflowService
  ) {}

  @Post(':deliveryScheduleId/receipt')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('delivery.receive')
  recordReceipt(
    @Param('deliveryScheduleId', new ParseUUIDPipe()) deliveryScheduleId: string,
    @Body(DeliveryReceiptPipe) command: DeliveryReceiptCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DeliveryReceiptResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.recordReceipt(
      deliveryScheduleId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }

  @Post(':deliveryScheduleId/inspection/start')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('delivery.receive')
  startInspection(
    @Param('deliveryScheduleId', new ParseUUIDPipe()) deliveryScheduleId: string,
    @Body(DeliveryStartInspectionPipe) command: DeliveryStartInspectionCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DeliveryStartInspectionResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.startInspection(
      deliveryScheduleId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
