import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { StockReceiptController } from './stock-receipt.controller'
import { StockReceiptCreatePipe } from './stock-receipt-create.pipe'
import { StockReceiptCreationService } from './stock-receipt-creation.service'
import {
  StockReceiptPostPipe,
  StockReceiptReversePipe,
} from './stock-receipt-workflow.pipe'
import { StockReceiptWorkflowService } from './stock-receipt-workflow.service'

@Module({
  imports: [AuditModule],
  controllers: [StockReceiptController],
  providers: [
    StockReceiptCreationService,
    StockReceiptCreatePipe,
    StockReceiptWorkflowService,
    StockReceiptPostPipe,
    StockReceiptReversePipe,
  ],
})
export class InventoryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(StockReceiptController)
  }
}
