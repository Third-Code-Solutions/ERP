import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { RoadmapController } from './roadmap.controller'
import { RoadmapService } from './roadmap.service'
import { ROADMAP_INTEGRATION_QUEUE } from './roadmap-integration.constants'
import { RoadmapIntegrationProcessor } from './roadmap-integration.processor'
import { RoadmapIntegrationQueue } from './roadmap-integration.queue'
import { RoadmapIntegrationService, ResendAndSemaphoreAdapter, SapHttpAdapter } from './roadmap-integration.service'

@Module({
  imports: [AuditModule, BullModule.registerQueue({ name: ROADMAP_INTEGRATION_QUEUE })],
  controllers: [RoadmapController],
  providers: [
    RoadmapService,
    ResendAndSemaphoreAdapter,
    SapHttpAdapter,
    RoadmapIntegrationService,
    RoadmapIntegrationQueue,
    RoadmapIntegrationProcessor,
  ],
})
export class RoadmapModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestObservabilityMiddleware).forRoutes(RoadmapController)
  }
}
