import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { ChangeRequestsController } from './change-requests.controller'
import { ChangeRequestCreationService } from './change-request-creation.service'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'
import { OpportunitiesController } from './opportunities.controller'
import { OpportunitiesService } from './opportunities.service'
import { OpportunityCreationController } from './opportunity-creation.controller'
import { OpportunityCreationPipe } from './opportunity-creation.pipe'
import { OpportunityCreationService } from './opportunity-creation.service'
import { OpportunityProjectConversionController } from './opportunity-project-conversion.controller'
import { OpportunityProjectConversionService } from './opportunity-project-conversion.service'
import { OpportunityStageTransitionController } from './opportunity-stage-transition.controller'
import { OpportunityStageTransitionPipe } from './opportunity-stage-transition.pipe'
import { OpportunityStageTransitionService } from './opportunity-stage-transition.service'

@Module({
  imports: [AuditModule],
  controllers: [
    ChangeRequestsController,
    AccountsController,
    OpportunitiesController,
    OpportunityCreationController,
    OpportunityProjectConversionController,
    OpportunityStageTransitionController,
  ],
  providers: [
    ChangeRequestCreationService,
    AccountsService,
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
        ChangeRequestsController,
      AccountsController,
      OpportunitiesController,
      OpportunityCreationController,
        OpportunityProjectConversionController
      )
  }
}
