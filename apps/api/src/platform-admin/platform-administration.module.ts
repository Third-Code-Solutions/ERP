import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'

import { AuthModule } from '../auth/auth.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { PlatformAdministrationController } from './platform-administration.controller'
import { PlatformAdministrationService } from './platform-administration.service'
import { PlatformIdentityAdminService } from './platform-identity-admin.service'

@Module({
  imports: [AuthModule],
  controllers: [PlatformAdministrationController],
  providers: [PlatformAdministrationService, PlatformIdentityAdminService],
})
export class PlatformAdministrationModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(PlatformAdministrationController)
  }
}
