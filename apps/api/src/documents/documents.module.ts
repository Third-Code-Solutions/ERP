import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { RequestObservabilityMiddleware } from '../observability/request-observability.middleware'
import { DocumentDeleteController } from './document-delete.controller'
import { DocumentDeletePipe } from './document-delete.pipe'
import { DocumentDeleteService } from './document-delete.service'
import { DocumentIntakeController } from './document-intake.controller'
import { DocumentIntakePipe } from './document-intake.pipe'
import { DocumentIntakeService } from './document-intake.service'
import { DocuSealWebhookController } from './docuseal-webhook.controller'
import { DocuSealWebhookPipe } from './docuseal-webhook.pipe'
import { DocuSealWebhookService } from './docuseal-webhook.service'
import { InspectionPhotoController } from './inspection-photo.controller'
import { InspectionPhotoPipe } from './inspection-photo.pipe'
import { InspectionPhotoService } from './inspection-photo.service'
import { InspectionPhotoStorageService } from './inspection-photo.storage'
import { PublicSigningController } from './public-signing.controller'
import { PublicSigningPipe } from './public-signing.pipe'
import { PublicSigningService } from './public-signing.service'
import { PublicSigningStorageService } from './public-signing.storage'
import { ClaimDocumentController } from './claim-document.controller'
import { ClaimDocumentPipe } from './claim-document.pipe'
import { ClaimDocumentService } from './claim-document.service'

@Module({
  imports: [AuditModule],
  controllers: [
    ClaimDocumentController,
    DocumentDeleteController,
    DocumentIntakeController,
    DocuSealWebhookController,
    InspectionPhotoController,
    PublicSigningController,
  ],
  providers: [
    ClaimDocumentPipe,
    ClaimDocumentService,
    DocumentDeletePipe,
    DocumentDeleteService,
    DocumentIntakePipe,
    DocumentIntakeService,
    DocuSealWebhookPipe,
    DocuSealWebhookService,
    InspectionPhotoPipe,
    InspectionPhotoService,
    InspectionPhotoStorageService,
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
        ClaimDocumentController,
        DocumentDeleteController,
        DocumentIntakeController,
        InspectionPhotoController,
        PublicSigningController
      )
  }
}
