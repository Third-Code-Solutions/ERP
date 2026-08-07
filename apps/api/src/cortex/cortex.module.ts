import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { CortexGraphController } from './cortex-graph.controller'
import { CortexGraphPipe } from './cortex-graph.pipe'
import { CortexGraphService } from './cortex-graph.service'
import { CortexSearchController } from './cortex-search.controller'
import { CortexSearchPipe } from './cortex-search.pipe'
import { CortexSearchService } from './cortex-search.service'

@Module({
  controllers: [CortexGraphController, CortexSearchController],
  providers: [
    CortexGraphService,
    CortexGraphPipe,
    CortexSearchService,
    CortexSearchPipe,
  ],
})
export class CortexModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(CortexGraphController, CortexSearchController)
  }
}
