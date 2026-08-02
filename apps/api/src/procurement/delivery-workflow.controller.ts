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
  DeliveryInspectionCompleteCommand,
  DeliveryInspectionCompleteResult,
  DeliveryCancelCommand,
  DeliveryCancelResult,
  DeliveryStartInspectionCommand,
  DeliveryStartInspectionResult,
  DeliveryStartSitePreparationCommand,
  DeliveryStartSitePreparationResult,
  DeliveryCompleteSitePreparationCommand,
  DeliveryCompleteSitePreparationResult,
} from '@third-code-erp/shared-types'
import {
  CurrentPrincipal,
  type ErpPrincipal,
} from '../auth/current-principal.decorator'
import { RequireCapabilities } from '../auth/capability.guard'
import { DeliveryInspectionCompletePipe } from './delivery-inspection-complete.pipe'
import { DeliveryCancelPipe } from './delivery-cancel.pipe'
import { DeliveryReceiptPipe } from './delivery-receipt.pipe'
import { DeliveryStartInspectionPipe } from './delivery-start-inspection.pipe'
import { DeliverySitePreparationStartPipe } from './delivery-site-preparation-start.pipe'
import { DeliverySitePreparationCompletePipe } from './delivery-site-preparation-complete.pipe'
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

  @Post(':deliveryScheduleId/site-preparation/start')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('delivery.receive')
  startSitePreparation(
    @Param('deliveryScheduleId', new ParseUUIDPipe()) deliveryScheduleId: string,
    @Body(DeliverySitePreparationStartPipe)
    command: DeliveryStartSitePreparationCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DeliveryStartSitePreparationResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.startSitePreparation(
      deliveryScheduleId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }

  @Post(':deliveryScheduleId/site-preparation/complete')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('delivery.receive')
  completeSitePreparation(
    @Param('deliveryScheduleId', new ParseUUIDPipe()) deliveryScheduleId: string,
    @Body(DeliverySitePreparationCompletePipe)
    command: DeliveryCompleteSitePreparationCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DeliveryCompleteSitePreparationResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.completeSitePreparation(
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

  @Post(':deliveryScheduleId/inspection/complete')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('delivery.receive')
  completeInspection(
    @Param('deliveryScheduleId', new ParseUUIDPipe()) deliveryScheduleId: string,
    @Body(DeliveryInspectionCompletePipe)
    command: DeliveryInspectionCompleteCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DeliveryInspectionCompleteResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.completeInspection(
      deliveryScheduleId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }

  @Post(':deliveryScheduleId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireCapabilities('delivery.receive')
  cancelDelivery(
    @Param('deliveryScheduleId', new ParseUUIDPipe()) deliveryScheduleId: string,
    @Body(DeliveryCancelPipe) command: DeliveryCancelCommand,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentPrincipal() principal: ErpPrincipal
  ): Promise<DeliveryCancelResult> {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required')
    }
    if (idempotencyKey.length > 256) {
      throw new BadRequestException('Idempotency-Key header is too long')
    }
    return this.workflow.cancelDelivery(
      deliveryScheduleId,
      command,
      principal,
      idempotencyKey.trim()
    )
  }
}
