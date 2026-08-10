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
import { RestoreCostEntryPipe } from './restore-cost-entry.pipe'
import { ProjectCommentsController } from './project-comments.controller'
import { ProjectCommentListPipe } from './project-comment-list.pipe'
import { ProjectCommentListService } from './project-comment-list.service'
import { ProjectCommentCreationService } from './project-comment-creation.service'
import { ProjectCommentDeletionService } from './project-comment-deletion.service'
import { CreateProjectCommentPipe } from './project-comment.pipe'

@Module({
  imports: [AuditModule],
  controllers: [
    ProjectsController,
    CostEntryCreationController,
    CostEntryDeletionController,
    ProjectCommentsController,
  ],
  providers: [
    ProjectsService,
    CostEntryCreationService,
    CostEntryDeletionService,
    DeleteCostEntryPipe,
    RestoreCostEntryPipe,
    ProjectCommentCreationService,
    ProjectCommentDeletionService,
    ProjectCommentListService,
    CreateProjectCommentPipe,
    ProjectCommentListPipe,
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
        ProjectCommentsController
      )
  }
}
