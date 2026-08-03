import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { DocumentDeleteController } from './document-delete.controller'
import { DocumentDeletePipe } from './document-delete.pipe'
import { DocumentDeleteService } from './document-delete.service'
import { PublicSigningController } from './public-signing.controller'
import { PublicSigningPipe } from './public-signing.pipe'
import { PublicSigningService } from './public-signing.service'
import { PublicSigningStorageService } from './public-signing.storage'

@Module({
  imports: [AuditModule],
  controllers: [DocumentDeleteController, PublicSigningController],
  providers: [
    DocumentDeletePipe,
    DocumentDeleteService,
    PublicSigningPipe,
    PublicSigningService,
    PublicSigningStorageService,
  ],
})
export class DocumentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(DocumentDeleteController, PublicSigningController)
  }
}
