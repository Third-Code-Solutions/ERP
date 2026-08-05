import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { AssetListPipe } from './asset-list.pipe'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, AssetListPipe],
})
export class AssetsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestObservabilityMiddleware).forRoutes(AssetsController)
  }
}
