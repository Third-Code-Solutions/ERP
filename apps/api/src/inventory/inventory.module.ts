import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { InventorySummaryController } from './inventory-summary.controller'
import { InventorySummaryService } from './inventory-summary.service'
import { InventoryItemConfigurationController } from './inventory-item-configuration.controller'
import { InventoryItemConfigurationPipe } from './inventory-item-configuration.pipe'
import { InventoryItemConfigurationService } from './inventory-item-configuration.service'
import { InventoryUomController } from './inventory-uom.controller'
import { InventoryUomCreatePipe } from './inventory-uom-create.pipe'
import { InventoryUomCreationService } from './inventory-uom-creation.service'
import { InventoryWarehouseController } from './inventory-warehouse.controller'
import { InventoryWarehouseCreatePipe } from './inventory-warehouse-create.pipe'
import { InventoryWarehouseCreationService } from './inventory-warehouse-creation.service'
import { InventoryWarehouseCloseoutController } from './inventory-warehouse-closeout.controller'
import { InventoryWarehouseCloseoutService } from './inventory-warehouse-closeout.service'
import { InventoryWarehouseUpdateController } from './inventory-warehouse-update.controller'
import { InventoryWarehouseUpdatePipe } from './inventory-warehouse-update.pipe'
import { InventoryWarehouseUpdateService } from './inventory-warehouse-update.service'
import { InventoryStockMovementListController } from './inventory-stock-movement-list.controller'
import { InventoryStockMovementListPipe } from './inventory-stock-movement-list.pipe'
import { InventoryStockMovementListService } from './inventory-stock-movement-list.service'
import { InventoryStockMovementDetailController } from './inventory-stock-movement-detail.controller'
import { InventoryStockMovementDetailService } from './inventory-stock-movement-detail.service'
import { InventoryStockMovementCreationController } from './inventory-stock-movement-creation.controller'
import { InventoryStockMovementCreatePipe } from './inventory-stock-movement-create.pipe'
import { InventoryStockMovementCreationService } from './inventory-stock-movement-creation.service'
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
  controllers: [
    StockReceiptController,
    InventorySummaryController,
    InventoryItemConfigurationController,
    InventoryUomController,
    InventoryWarehouseController,
    InventoryWarehouseUpdateController,
    InventoryWarehouseCloseoutController,
    InventoryStockMovementListController,
    InventoryStockMovementDetailController,
    InventoryStockMovementCreationController,
  ],
  providers: [
    InventorySummaryService,
    InventoryItemConfigurationService,
    InventoryItemConfigurationPipe,
    InventoryUomCreationService,
    InventoryUomCreatePipe,
    InventoryWarehouseCreationService,
    InventoryWarehouseCreatePipe,
    InventoryWarehouseUpdateService,
    InventoryWarehouseUpdatePipe,
    InventoryWarehouseCloseoutService,
    StockReceiptCreationService,
    StockReceiptCreatePipe,
    StockReceiptWorkflowService,
    StockReceiptPostPipe,
    StockReceiptReversePipe,
    InventoryStockMovementListService,
    InventoryStockMovementListPipe,
    InventoryStockMovementDetailService,
    InventoryStockMovementCreationService,
    InventoryStockMovementCreatePipe,
  ],
})
export class InventoryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        StockReceiptController,
        InventorySummaryController,
        InventoryItemConfigurationController,
        InventoryUomController,
        InventoryWarehouseController,
        InventoryWarehouseUpdateController,
        InventoryWarehouseCloseoutController,
        InventoryStockMovementListController,
        InventoryStockMovementDetailController,
        InventoryStockMovementCreationController
      )
  }
}
