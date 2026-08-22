import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'
import { ProjectCommandCenterPipe } from './project-command-center.pipe'
import { ProjectCommandCenterService } from './project-command-center.service'
import { CostEntryCreationController } from './cost-entry-creation.controller'
import { CostEntryCreationService } from './cost-entry-creation.service'
import { CostEntryDeletionController } from './cost-entry-deletion.controller'
import { CostEntryDeletionService } from './cost-entry-deletion.service'
import { DeleteCostEntryPipe } from './delete-cost-entry.pipe'
import { RestoreCostEntryPipe } from './restore-cost-entry.pipe'
import { ProjectCommentsController } from './project-comments.controller'
import { ProjectCommentListPipe } from './project-comment-list.pipe'
import { ProjectCommentListService } from './project-comment-list.service'
import { ProjectCommentCreationService } from './project-comment-creation.service'
import { ProjectCommentDeletionService } from './project-comment-deletion.service'
import { CreateProjectCommentPipe } from './project-comment.pipe'
import { ProjectRetirementController } from './project-retirement.controller'
import { ProjectRetirementService } from './project-retirement.service'
import { RetireProjectPipe } from './retire-project.pipe'

@Module({
  imports: [AuditModule],
  controllers: [
    ProjectsController,
    CostEntryCreationController,
    CostEntryDeletionController,
    ProjectCommentsController,
    ProjectRetirementController,
  ],
  providers: [
    ProjectsService,
    ProjectCommandCenterService,
    CostEntryCreationService,
    CostEntryDeletionService,
    DeleteCostEntryPipe,
    RestoreCostEntryPipe,
    ProjectCommentCreationService,
    ProjectCommentDeletionService,
    ProjectCommentListService,
    CreateProjectCommentPipe,
    ProjectRetirementService,
    RetireProjectPipe,
    ProjectCommentListPipe,
    ProjectCommandCenterPipe,
  ],
})
export class ProjectsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        ProjectsController,
        CostEntryCreationController,
        CostEntryDeletionController,
        ProjectCommentsController,
        ProjectRetirementController
      )
  }
}
