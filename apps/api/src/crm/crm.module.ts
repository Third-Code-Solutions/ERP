import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ChangeRequestsController } from './change-requests.controller'
import { ChangeRequestCreationService } from './change-request-creation.service'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'

@Module({
  imports: [AuditModule],
  controllers: [ChangeRequestsController, AccountsController],
  providers: [ChangeRequestCreationService, AccountsService],
})
export class CrmModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(ChangeRequestsController, AccountsController)
  }
}
