import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { CadEvidenceCommitController } from './cad-evidence-commit.controller'
import { CadEvidenceCommitPipe } from './cad-evidence-commit.pipe'
import { CadEvidenceCommitService } from './cad-evidence-commit.service'
import { BullModule } from '@nestjs/bullmq'
import { DOCUMENT_PROCESSING_QUEUE } from './document-processing.constants'
import { DocumentProcessingController } from './document-processing.controller'
import { DocumentProcessingJobQueue } from './document-processing.queue'
import { DocumentProcessingPipe } from './document-processing.pipe'
import { DocumentProcessingService } from './document-processing.service'

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue({ name: DOCUMENT_PROCESSING_QUEUE }),
  ],
  controllers: [CadEvidenceCommitController, DocumentProcessingController],
  providers: [
    CadEvidenceCommitPipe,
    CadEvidenceCommitService,
    DocumentProcessingPipe,
    DocumentProcessingService,
    DocumentProcessingJobQueue,
  ],
})
export class CadModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(CadEvidenceCommitController, DocumentProcessingController)
  }
}
