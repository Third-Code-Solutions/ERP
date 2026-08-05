import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { CortexSearchController } from './cortex-search.controller'
import { CortexSearchPipe } from './cortex-search.pipe'
import { CortexSearchService } from './cortex-search.service'

@Module({
  controllers: [CortexSearchController],
  providers: [CortexSearchService, CortexSearchPipe],
})
export class CortexModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(CortexSearchController)
  }
}
