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
import { TakeoffImportController } from './takeoff-import.controller'
import { TakeoffImportPipe } from './takeoff-import.pipe'
import { TakeoffImportService } from './takeoff-import.service'
import { DocumentProcessingDraftBomService } from './document-processing.bom'
import { DocumentProcessingEvidenceService } from './document-processing.evidence'
import { BullModule } from '@nestjs/bullmq'
import { DOCUMENT_PROCESSING_QUEUE } from './document-processing.constants'
import { DocumentProcessingController } from './document-processing.controller'
import { DocumentProcessingJobQueue } from './document-processing.queue'
import { DocumentProcessingPipe } from './document-processing.pipe'
import { DocumentProcessingProcessor } from './document-processing.processor'
import { DocumentProcessingService } from './document-processing.service'
import { DocumentProcessingStateService } from './document-processing.state'
import { DocumentProcessingStorageService } from './document-processing.storage'
import { DocumentProcessingWorkerClient } from './document-processing.worker'

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue({ name: DOCUMENT_PROCESSING_QUEUE }),
  ],
  controllers: [
    CadEvidenceCommitController,
    DocumentProcessingController,
    TakeoffImportController,
  ],
  providers: [
    CadEvidenceCommitPipe,
    CadEvidenceCommitService,
    TakeoffImportPipe,
    TakeoffImportService,
    DocumentProcessingDraftBomService,
    DocumentProcessingEvidenceService,
    DocumentProcessingPipe,
    DocumentProcessingProcessor,
    DocumentProcessingService,
    DocumentProcessingJobQueue,
    DocumentProcessingStateService,
    DocumentProcessingStorageService,
    DocumentProcessingWorkerClient,
  ],
})
export class CadModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        CadEvidenceCommitController,
        DocumentProcessingController,
        TakeoffImportController
      )
  }
}
