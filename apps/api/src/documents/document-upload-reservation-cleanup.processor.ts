import { randomUUID } from 'node:crypto'

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'

import {
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_QUEUE,
  documentUploadReservationCleanupJobSchema,
  type DocumentUploadReservationCleanupJob,
} from './document-upload-reservation-cleanup.constants'
import {
  DocumentUploadReservationCleanupService,
  type DocumentUploadReservationCleanupResult,
} from './document-upload-reservation-cleanup.service'

@Processor(DOCUMENT_UPLOAD_RESERVATION_CLEANUP_QUEUE)
export class DocumentUploadReservationCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(
    DocumentUploadReservationCleanupProcessor.name
  )

  constructor(
    @Inject(DocumentUploadReservationCleanupService)
    private readonly cleanup: DocumentUploadReservationCleanupService
  ) {
    super()
  }

  async process(
    job: Job<DocumentUploadReservationCleanupJob, unknown, string>
  ): Promise<DocumentUploadReservationCleanupResult> {
    const traceId = randomUUID()
    const startedAt = Date.now()
    try {
      if (job.name !== DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB) {
        throw new Error('Unsupported document upload reservation cleanup job')
      }
      const parsed = documentUploadReservationCleanupJobSchema.safeParse(job.data)
      if (!parsed.success) {
        throw new Error('Invalid document upload reservation cleanup job data')
      }
      const result = await this.cleanup.runBatch(traceId)
      this.logger.log(
        JSON.stringify({
          event: 'erp.document.upload_cleanup.job',
          trace_id: traceId,
          tenant_id: null,
          actor_id: null,
          action: 'document.upload_cleanup',
          outcome: result.status,
          duration_ms: Date.now() - startedAt,
          expired_total: result.expired,
          claimed_total: result.claimed,
          removed_total: result.removed,
          failed_total: result.failed,
          cleanup_retries_total: result.cleanupRetries,
          cleanup_exhausted_total: result.exhausted,
          oldest_expired_age_seconds: result.oldestExpiredAgeSeconds,
        })
      )
      return result
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'erp.document.upload_cleanup.job',
          trace_id: traceId,
          tenant_id: null,
          actor_id: null,
          action: 'document.upload_cleanup',
          outcome: 'failed',
          duration_ms: Date.now() - startedAt,
          error_code: 'DOCUMENT_UPLOAD_CLEANUP_JOB_FAILED',
        })
      )
      throw error
    }
  }
}
