import { BullModule } from '@nestjs/bullmq'
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { DocumentDeleteController } from './document-delete.controller'
import { DocumentDeletePipe } from './document-delete.pipe'
import { DocumentDeleteService } from './document-delete.service'
import { DocumentIntakeController } from './document-intake.controller'
import { DocumentIntakePipe } from './document-intake.pipe'
import { DocumentIntakeService } from './document-intake.service'
import { DocumentUploadReservationController } from './document-upload-reservation.controller'
import { DOCUMENT_UPLOAD_RESERVATION_CLEANUP_QUEUE } from './document-upload-reservation-cleanup.constants'
import { DocumentUploadReservationCleanupProcessor } from './document-upload-reservation-cleanup.processor'
import { DocumentUploadReservationCleanupQueue } from './document-upload-reservation-cleanup.queue'
import { DocumentUploadReservationCleanupService } from './document-upload-reservation-cleanup.service'
import {
  DocumentUploadReservationMutationPipe,
  DocumentUploadReservationPipe,
} from './document-upload-reservation.pipe'
import { DocumentUploadReservationService } from './document-upload-reservation.service'
import { DocumentUploadReservationStorage } from './document-upload-reservation.storage'
import { DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_QUEUE } from './document-upload-reservation-reconciliation.constants'
import { DocumentUploadReservationReconciliationProcessor } from './document-upload-reservation-reconciliation.processor'
import { DocumentUploadReservationReconciliationQueue } from './document-upload-reservation-reconciliation.queue'
import { DocumentUploadReservationReconciliationService } from './document-upload-reservation-reconciliation.service'
import { DocuSealWebhookController } from './docuseal-webhook.controller'
import { DocuSealWebhookPipe } from './docuseal-webhook.pipe'
import { DocuSealWebhookService } from './docuseal-webhook.service'
import { DocuSealArtifactStorage } from './docuseal-artifact.storage'
import { DocuSealProviderService } from './docuseal-provider.service'
import { InspectionPhotoController } from './inspection-photo.controller'
import { InspectionPhotoPipe } from './inspection-photo.pipe'
import { InspectionPhotoService } from './inspection-photo.service'
import { PublicSigningController } from './public-signing.controller'
import { PublicSigningPipe } from './public-signing.pipe'
import { PublicSigningService } from './public-signing.service'
import { PublicSigningStorageService } from './public-signing.storage'

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue({
      name: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_QUEUE,
    }),
    BullModule.registerQueue({
      name: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_QUEUE,
    }),
  ],
  controllers: [
    DocumentDeleteController,
    DocumentIntakeController,
    DocumentUploadReservationController,
    DocuSealWebhookController,
    InspectionPhotoController,
    PublicSigningController,
  ],
  providers: [
    DocumentDeletePipe,
    DocumentDeleteService,
    DocumentIntakePipe,
    DocumentIntakeService,
    DocumentUploadReservationPipe,
    DocumentUploadReservationMutationPipe,
    DocumentUploadReservationCleanupProcessor,
    DocumentUploadReservationCleanupQueue,
    DocumentUploadReservationCleanupService,
    DocumentUploadReservationService,
    DocumentUploadReservationStorage,
    DocumentUploadReservationReconciliationProcessor,
    DocumentUploadReservationReconciliationQueue,
    DocumentUploadReservationReconciliationService,
    DocuSealArtifactStorage,
    DocuSealProviderService,
    DocuSealWebhookPipe,
    DocuSealWebhookService,
    InspectionPhotoPipe,
    InspectionPhotoService,
    PublicSigningPipe,
    PublicSigningService,
    PublicSigningStorageService,
  ],
})
export class DocumentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(
        DocumentDeleteController,
        DocumentIntakeController,
        DocumentUploadReservationController,
        InspectionPhotoController,
        PublicSigningController
      )
  }
}
