import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ProcurementController } from './procurement.controller'
import { ProcurementService } from './procurement.service'

@Module({
  imports: [AuditModule],
  controllers: [ProcurementController],
  providers: [ProcurementService],
})
export class ProcurementModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(ProcurementController)
  }
}
