import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { UserRoleAssignmentController } from './user-role-assignment.controller'
import { UserRoleAssignmentPipe } from './user-role-assignment.pipe'
import { UserRoleAssignmentService } from './user-role-assignment.service'

@Module({
  imports: [AuditModule],
  controllers: [UserRoleAssignmentController],
  providers: [UserRoleAssignmentService, UserRoleAssignmentPipe],
})
export class AdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(UserRoleAssignmentController)
  }
}
