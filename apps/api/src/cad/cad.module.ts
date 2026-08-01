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

@Module({
  imports: [AuditModule],
  controllers: [CadEvidenceCommitController],
  providers: [CadEvidenceCommitPipe, CadEvidenceCommitService],
})
export class CadModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestObservabilityMiddleware)
      .forRoutes(CadEvidenceCommitController)
  }
}
