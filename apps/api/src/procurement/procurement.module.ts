import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ProcurementController } from './procurement.controller'
import { DeliveryReceiptPipe } from './delivery-receipt.pipe'
import { DeliveryMarkInTransitPipe } from './delivery-mark-in-transit.pipe'
import { DeliveryCancelPipe } from './delivery-cancel.pipe'
import { DeliveryInspectionCompletePipe } from './delivery-inspection-complete.pipe'
import { DeliveryStartInspectionPipe } from './delivery-start-inspection.pipe'
import { DeliverySitePreparationStartPipe } from './delivery-site-preparation-start.pipe'
import { DeliverySitePreparationCompletePipe } from './delivery-site-preparation-complete.pipe'
import { DeliveryWorkflowController } from './delivery-workflow.controller'
import { DeliveryWorkflowService } from './delivery-workflow.service'
import { DeliveryScheduleCreatePipe } from './delivery-schedule-create.pipe'
import { PurchaseOrderController } from './purchase-order.controller'
import { ProcurementService } from './procurement.service'
import { PurchaseOrderCreationService } from './purchase-order-creation.service'
import { PurchaseOrderWorkflowPipe } from './purchase-order-workflow.pipe'
import { PurchaseOrderWorkflowService } from './purchase-order-workflow.service'
import {
  RFQ_DISPATCH_DEAD_LETTER_QUEUE,
  RFQ_DISPATCH_QUEUE,
} from './rfq-dispatch.constants'
import { RfqDispatchProcessor } from './rfq-dispatch.processor'
import { RfqDispatchQueue } from './rfq-dispatch.queue'
import { NOTIFICATION_DELIVERY_QUEUE } from './notification-delivery.constants'
import { NotificationDeliveryProcessor } from './notification-delivery.processor'
import { NotificationDeliveryQueue } from './notification-delivery.queue'
import { NotificationDeliveryService } from './notification-delivery.service'
import { NotificationEmailService } from './notification-email.service'
import { PublicVendorConfirmationController } from './public-vendor-confirmation.controller'
import { PublicVendorConfirmationPipe } from './public-vendor-confirmation.pipe'
import { PublicVendorConfirmationService } from './public-vendor-confirmation.service'
import { VendorConfirmationSessionMintingService } from './vendor-confirmation-session-minting.service'
import { VendorConfirmationLinkService } from './vendor-confirmation-link.service'

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue(
      { name: RFQ_DISPATCH_QUEUE },
      { name: RFQ_DISPATCH_DEAD_LETTER_QUEUE },
      { name: NOTIFICATION_DELIVERY_QUEUE }
    ),
  ],
  controllers: [
    ProcurementController,
    PurchaseOrderController,
    DeliveryWorkflowController,
    PublicVendorConfirmationController,
  ],
  providers: [
    ProcurementService,
    PurchaseOrderCreationService,
    PurchaseOrderWorkflowService,
    PurchaseOrderWorkflowPipe,
    DeliveryWorkflowService,
    DeliveryScheduleCreatePipe,
    DeliveryReceiptPipe,
    DeliveryMarkInTransitPipe,
    DeliveryCancelPipe,
    DeliveryInspectionCompletePipe,
    DeliveryStartInspectionPipe,
    DeliverySitePreparationStartPipe,
    DeliverySitePreparationCompletePipe,
    RfqDispatchQueue,
    RfqDispatchProcessor,
    NotificationDeliveryQueue,
    NotificationDeliveryProcessor,
    NotificationDeliveryService,
    NotificationEmailService,
    PublicVendorConfirmationPipe,
    PublicVendorConfirmationService,
    VendorConfirmationSessionMintingService,
    VendorConfirmationLinkService,
  ],
})
export class ProcurementModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        ProcurementController,
        PurchaseOrderController,
        DeliveryWorkflowController,
        PublicVendorConfirmationController
      )
  }
}
