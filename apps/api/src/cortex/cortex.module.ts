import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { AuditModule } from '../audit/audit.module'
import { BullModule } from '@nestjs/bullmq'
import { ProviderQuotaModule } from '../observability/provider-quota.module'
import { CortexEntityController } from './cortex-entity.controller'
import { CortexEntityPipe } from './cortex-entity.pipe'
import { CortexEntityService } from './cortex-entity.service'
import { CortexGraphController } from './cortex-graph.controller'
import { CortexGraphPipe } from './cortex-graph.pipe'
import { CortexGraphService } from './cortex-graph.service'
import { CortexConversationsController } from './cortex-conversations.controller'
import { CortexConversationIdPipe } from './cortex-conversations.pipe'
import { CortexConversationsService } from './cortex-conversations.service'
import { CortexConversationTurnPipe } from './cortex-conversation-turn.pipe'
import { CortexConversationTurnsService } from './cortex-conversation-turns.service'
import {
  CortexAssistantTurnClaimPipe,
  CortexAssistantTurnCompletePipe,
} from './cortex-assistant-turn.pipe'
import { CortexAssistantTurnsService } from './cortex-assistant-turns.service'
import { CORTEX_ASSISTANT_GENERATION_QUEUE } from './cortex-assistant-generation.constants'
import { CortexAssistantGenerationController } from './cortex-assistant-generation.controller'
import { CortexAssistantGenerationStartPipe } from './cortex-assistant-generation.pipe'
import { CortexAssistantGenerationProcessor } from './cortex-assistant-generation.processor'
import { CortexAssistantGenerationJobQueue } from './cortex-assistant-generation.queue'
import { CortexAssistantGenerationService } from './cortex-assistant-generation.service'
import { CortexAssistantGenerationStateService } from './cortex-assistant-generation.state'
import { CortexAssistantGenerationWorkerClient } from './cortex-assistant-generation.worker'
import { CortexAssistantProviderAdapter } from './cortex-assistant-provider.adapter'
import { CortexAssistantProviderBudgetService } from './cortex-assistant-provider-budget.service'
import { CortexAssistantProviderCircuitAlertService } from './cortex-assistant-provider-circuit-alert.service'
import { CortexAssistantProviderExecutionService } from './cortex-assistant-provider-execution.service'
import { CortexAssistantProviderHealthController } from './cortex-assistant-provider-health.controller'
import { CortexAssistantProviderHealthPipe } from './cortex-assistant-provider-health.pipe'
import { CortexAssistantProviderHealthService } from './cortex-assistant-provider-health.service'
import { CortexSearchController } from './cortex-search.controller'
import { CortexSearchPipe } from './cortex-search.pipe'
import { CortexSearchService } from './cortex-search.service'
import { CORTEX_SEMANTIC_INDEX_QUEUE } from './cortex-semantic-index.constants'
import { CortexSemanticIndexController } from './cortex-semantic-index.controller'
import { CortexSemanticIndexPipe } from './cortex-semantic-index.pipe'
import { CortexSemanticIndexProcessor } from './cortex-semantic-index.processor'
import { CortexSemanticIndexJobQueue } from './cortex-semantic-index.queue'
import { CortexSemanticIndexService } from './cortex-semantic-index.service'
import { CortexSemanticIndexStateService } from './cortex-semantic-index.state'
import { CortexSemanticIndexWorkerClient } from './cortex-semantic-index.worker'

@Module({
  imports: [
    AuditModule,
    ProviderQuotaModule,
    BullModule.registerQueue({ name: CORTEX_SEMANTIC_INDEX_QUEUE }),
    BullModule.registerQueue({ name: CORTEX_ASSISTANT_GENERATION_QUEUE }),
  ],
  controllers: [
    CortexConversationsController,
    CortexAssistantGenerationController,
    CortexAssistantProviderHealthController,
    CortexEntityController,
    CortexGraphController,
    CortexSearchController,
    CortexSemanticIndexController,
  ],
  providers: [
    CortexConversationsService,
    CortexConversationIdPipe,
    CortexConversationTurnPipe,
    CortexConversationTurnsService,
    CortexAssistantTurnClaimPipe,
    CortexAssistantTurnCompletePipe,
    CortexAssistantTurnsService,
    CortexAssistantGenerationStartPipe,
    CortexAssistantGenerationProcessor,
    CortexAssistantGenerationJobQueue,
    CortexAssistantGenerationService,
    CortexAssistantGenerationStateService,
    CortexAssistantGenerationWorkerClient,
    CortexAssistantProviderAdapter,
    CortexAssistantProviderBudgetService,
    CortexAssistantProviderCircuitAlertService,
    CortexAssistantProviderExecutionService,
    CortexAssistantProviderHealthPipe,
    CortexAssistantProviderHealthService,
    CortexEntityService,
    CortexEntityPipe,
    CortexGraphService,
    CortexGraphPipe,
    CortexSearchService,
    CortexSearchPipe,
    CortexSemanticIndexPipe,
    CortexSemanticIndexProcessor,
    CortexSemanticIndexJobQueue,
    CortexSemanticIndexService,
    CortexSemanticIndexStateService,
    CortexSemanticIndexWorkerClient,
  ],
})
export class CortexModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        CortexEntityController,
        CortexConversationsController,
        CortexAssistantGenerationController,
        CortexAssistantProviderHealthController,
        CortexGraphController,
        CortexSearchController,
        CortexSemanticIndexController
      )
  }
}
