import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ProcurementController } from './procurement.controller'
import { ProcurementService } from './procurement.service'
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
  controllers: [ProcurementController],
  providers: [
    ProcurementService,
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
      .forRoutes(ProcurementController)
  }
}
