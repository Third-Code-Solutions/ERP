import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ChangeRequestsController } from './change-requests.controller'
import { ChangeRequestCreationService } from './change-request-creation.service'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'
import { KycArtifactController } from './kyc-artifact.controller'
import { KycArtifactService } from './kyc-artifact.service'
import { OpportunitiesController } from './opportunities.controller'
import { OpportunitiesService } from './opportunities.service'
import { OpportunityCreationController } from './opportunity-creation.controller'
import { OpportunityCreationPipe } from './opportunity-creation.pipe'
import { OpportunityCreationService } from './opportunity-creation.service'
import { InspectionRfisController } from './inspection-rfis.controller'
import { InspectionRfisService } from './inspection-rfis.service'
import { OpportunityProjectConversionController } from './opportunity-project-conversion.controller'
import { OpportunityProjectConversionService } from './opportunity-project-conversion.service'
import { OpportunityStageTransitionController } from './opportunity-stage-transition.controller'
import { OpportunityStageTransitionPipe } from './opportunity-stage-transition.pipe'
import { OpportunityStageTransitionService } from './opportunity-stage-transition.service'

@Module({
  imports: [AuditModule],
  controllers: [
    InspectionRfisController,
    ChangeRequestsController,
    AccountsController,
    KycArtifactController,
    OpportunitiesController,
    OpportunityCreationController,
    OpportunityProjectConversionController,
    OpportunityStageTransitionController,
  ],
  providers: [
    InspectionRfisService,
    ChangeRequestCreationService,
    AccountsService,
    KycArtifactService,
    OpportunitiesService,
    OpportunityCreationService,
    OpportunityCreationPipe,
    OpportunityProjectConversionService,
    OpportunityStageTransitionPipe,
    OpportunityStageTransitionService,
  ],
})
export class CrmModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        InspectionRfisController,
        ChangeRequestsController,
        AccountsController,
        KycArtifactController,
        OpportunitiesController,
        OpportunityCreationController,
        OpportunityProjectConversionController
      )
  }
}
