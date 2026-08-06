import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { CostEntryCreationController } from './cost-entry-creation.controller'
import { CostEntryCreationService } from './cost-entry-creation.service'
import { CostEntryDeletionController } from './cost-entry-deletion.controller'
import { CostEntryDeletionService } from './cost-entry-deletion.service'
import { DeleteCostEntryPipe } from './delete-cost-entry.pipe'

@Module({
  imports: [AuditModule],
  controllers: [
    ProjectsController,
    CostEntryCreationController,
    CostEntryDeletionController,
  ],
  providers: [
    ProjectsService,
    CostEntryCreationService,
    CostEntryDeletionService,
    DeleteCostEntryPipe,
  ],
})
export class ProjectsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        ProjectsController,
        CostEntryCreationController,
        CostEntryDeletionController
      )
  }
}
