import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { InventorySummaryController } from './inventory-summary.controller'
import { InventorySummaryService } from './inventory-summary.service'
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
  controllers: [StockReceiptController, InventorySummaryController],
  providers: [
    InventorySummaryService,
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
      .forRoutes(StockReceiptController, InventorySummaryController)
  }
}
