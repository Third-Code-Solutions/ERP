import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { JournalPostController } from './journal-post.controller'
import { JournalPostService } from './journal-post.service'
import { JournalReverseController } from './journal-reverse.controller'
import { JournalReverseService } from './journal-reverse.service'
import { SupplierBillPostController } from './supplier-bill-post.controller'
import { SupplierBillPostService } from './supplier-bill-post.service'

@Module({
  imports: [AuditModule],
  controllers: [
    JournalPostController,
    JournalReverseController,
    SupplierBillPostController,
  ],
  providers: [
    JournalPostService,
    JournalReverseService,
    SupplierBillPostService,
  ],
})
export class FinanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        JournalPostController,
        JournalReverseController,
        SupplierBillPostController
      )
  }
}
