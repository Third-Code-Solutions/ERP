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
import { ProjectRfisController } from './project-rfis.controller'
import { ProjectRfisService } from './project-rfis.service'
import { SiteDiaryController } from './site-diary.controller'
import { SiteDiaryService } from './site-diary.service'
import { QualityHoldPointsController } from './quality-hold-points.controller'
import { QualityHoldPointsService } from './quality-hold-points.service'
import { ProjectSubmittalsController } from './project-submittals.controller'
import { ProjectSubmittalsService } from './project-submittals.service'
import { ProjectSubmittalDocumentsController } from './project-submittal-documents.controller'
import { ProjectSubmittalDocumentsService } from './project-submittal-documents.service'
import { ProjectScheduleController } from './project-schedule.controller'
import { ProjectScheduleService } from './project-schedule.service'
import { ProjectPerformanceController } from './project-performance.controller'
import { ProjectPerformanceService } from './project-performance.service'
import { ProjectMaterialActualsController } from './project-material-actuals.controller'
import { ProjectMaterialActualsService } from './project-material-actuals.service'
import { ProjectLabourReconciliationController } from './project-labour-reconciliation.controller'
import { ProjectLabourReconciliationService } from './project-labour-reconciliation.service'
import { ProjectHandoverReadinessController } from './project-handover-readiness.controller'
import { ProjectHandoverReadinessService } from './project-handover-readiness.service'
import { ProjectCloseoutReadinessController } from './project-closeout-readiness.controller'
import { ProjectCloseoutReadinessService } from './project-closeout-readiness.service'
import { ProjectWeeklyProgressController } from './project-weekly-progress.controller'
import { ProjectWeeklyProgressService } from './project-weekly-progress.service'
import { ProjectBillingMilestonesController } from './project-billing-milestones.controller'
import { ProjectBillingMilestonesService } from './project-billing-milestones.service'

@Module({
  imports: [AuditModule],
  controllers: [
    ProjectsController,
    CostEntryCreationController,
    CostEntryDeletionController,
    ProjectCommentsController,
    ProjectRetirementController,
    ProjectRfisController,
    SiteDiaryController,
    QualityHoldPointsController,
    ProjectSubmittalsController,
    ProjectSubmittalDocumentsController,
    ProjectScheduleController,
    ProjectPerformanceController,
    ProjectMaterialActualsController,
    ProjectLabourReconciliationController,
    ProjectHandoverReadinessController,
    ProjectCloseoutReadinessController,
    ProjectWeeklyProgressController,
    ProjectBillingMilestonesController,
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
    ProjectRfisService,
    SiteDiaryService,
    QualityHoldPointsService,
    ProjectSubmittalsService,
    ProjectSubmittalDocumentsService,
    ProjectScheduleService,
    ProjectPerformanceService,
    ProjectMaterialActualsService,
    ProjectLabourReconciliationService,
    ProjectHandoverReadinessService,
    ProjectCloseoutReadinessService,
    ProjectWeeklyProgressService,
    ProjectBillingMilestonesService,
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
        ProjectRetirementController,
        ProjectRfisController,
        SiteDiaryController,
        QualityHoldPointsController,
        ProjectSubmittalsController,
        ProjectSubmittalDocumentsController,
        ProjectScheduleController,
        ProjectPerformanceController,
        ProjectMaterialActualsController,
        ProjectLabourReconciliationController,
        ProjectHandoverReadinessController,
        ProjectCloseoutReadinessController,
        ProjectWeeklyProgressController,
        ProjectBillingMilestonesController,
      )
  }
}
