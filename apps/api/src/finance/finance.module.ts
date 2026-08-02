import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { JournalPostController } from './journal-post.controller'
import { JournalPostService } from './journal-post.service'

@Module({
  imports: [AuditModule],
  controllers: [JournalPostController],
  providers: [JournalPostService],
})
export class FinanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(JournalPostController)
  }
}
