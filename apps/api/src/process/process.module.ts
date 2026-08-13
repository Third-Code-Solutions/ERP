import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ProcessController } from './process.controller'
import { ProcessService } from './process.service'

@Module({
  imports: [AuditModule],
  controllers: [ProcessController],
  providers: [ProcessService],
})
export class ProcessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(ProcessController)
  }
}
