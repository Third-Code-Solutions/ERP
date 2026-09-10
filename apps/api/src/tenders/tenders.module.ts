import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { TendersController } from './tenders.controller'
import { TendersService } from './tenders.service'

@Module({
  imports: [AuditModule],
  controllers: [TendersController],
  providers: [TendersService],
})
export class TendersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestObservabilityMiddleware).forRoutes(TendersController)
  }
}
