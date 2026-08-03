import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { DocumentDeleteController } from './document-delete.controller'
import { DocumentDeletePipe } from './document-delete.pipe'
import { DocumentDeleteService } from './document-delete.service'

@Module({
  imports: [AuditModule],
  controllers: [DocumentDeleteController],
  providers: [DocumentDeletePipe, DocumentDeleteService],
})
export class DocumentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(DocumentDeleteController)
  }
}
