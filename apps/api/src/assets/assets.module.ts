import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { AuditModule } from '../audit/audit.module'
import { AssetMaintenanceController } from './asset-maintenance.controller'
import { AssetMaintenanceCreatePipe } from './asset-maintenance-create.pipe'
import { AssetMaintenanceListPipe } from './asset-maintenance-list.pipe'
import { AssetMaintenanceService } from './asset-maintenance.service'
import { AssetListPipe } from './asset-list.pipe'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'

@Module({
  imports: [AuditModule],
  controllers: [AssetsController, AssetMaintenanceController],
  providers: [
    AssetsService,
    AssetListPipe,
    AssetMaintenanceService,
    AssetMaintenanceListPipe,
    AssetMaintenanceCreatePipe,
  ],
})
export class AssetsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(AssetsController, AssetMaintenanceController)
  }
}
