import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { DailyTaskCompletionController } from './daily-task-completion.controller'
import { DailyTaskCompletionPipe } from './daily-task-completion.pipe'
import { DailyTaskCompletionService } from './daily-task-completion.service'

@Module({
  imports: [AuditModule],
  controllers: [DailyTaskCompletionController],
  providers: [DailyTaskCompletionPipe, DailyTaskCompletionService],
})
export class DailyTasksModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(DailyTaskCompletionController)
  }
}
