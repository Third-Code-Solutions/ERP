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
import { DeliveryStartInspectionPipe } from './delivery-start-inspection.pipe'
import { DeliveryWorkflowController } from './delivery-workflow.controller'
import { DeliveryWorkflowService } from './delivery-workflow.service'
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
  ],
  providers: [
    ProcurementService,
    PurchaseOrderCreationService,
    PurchaseOrderWorkflowService,
    PurchaseOrderWorkflowPipe,
    DeliveryWorkflowService,
    DeliveryReceiptPipe,
    DeliveryStartInspectionPipe,
    RfqDispatchQueue,
    RfqDispatchProcessor,
    NotificationDeliveryQueue,
    NotificationDeliveryProcessor,
    NotificationDeliveryService,
    NotificationEmailService,
  ],
})
export class ProcurementModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        ProcurementController,
        PurchaseOrderController,
        DeliveryWorkflowController
      )
  }
}
