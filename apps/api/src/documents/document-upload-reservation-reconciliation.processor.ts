import { createHash, randomUUID } from 'node:crypto'

import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'

import {
  documentUploadReservationReconciliationJobSchema,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_QUEUE,
  type DocumentUploadReservationReconciliationJob,
} from './document-upload-reservation-reconciliation.constants'
import { DocumentUploadReservationReconciliationQueue } from './document-upload-reservation-reconciliation.queue'
import {
  DocumentUploadReservationReconciliationService,
  type DocumentUploadReservationReconciliationResult,
} from './document-upload-reservation-reconciliation.service'

@Processor(DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_QUEUE)
export class DocumentUploadReservationReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(
    DocumentUploadReservationReconciliationProcessor.name
  )

  constructor(
    @Inject(DocumentUploadReservationReconciliationService)
    private readonly reconciliation: DocumentUploadReservationReconciliationService,
    @Inject(DocumentUploadReservationReconciliationQueue)
    private readonly queue: DocumentUploadReservationReconciliationQueue
  ) {
    super()
  }

  async process(
    job: Job<DocumentUploadReservationReconciliationJob, unknown, string>
  ): Promise<DocumentUploadReservationReconciliationResult> {
    const traceId = randomUUID()
    const startedAt = Date.now()
    let tenantId: string | null = null
    try {
      if (job.name !== DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB) {
        throw new Error('Unsupported document upload reconciliation job')
      }
      const parsed = documentUploadReservationReconciliationJobSchema.safeParse(
        job.data
      )
      if (!parsed.success || typeof job.id !== 'string') {
        throw new Error('Invalid document upload reconciliation job data')
      }
      tenantId = parsed.data.tenantId
      const result = await this.reconciliation.runPage(parsed.data, traceId)
      if (result.nextCursor && result.rolloverCursor) {
        throw new Error('Invalid document upload reconciliation result')
      }
      if (result.nextCursor) {
        await this.queue.enqueueContinuation(
          { ...parsed.data, cursor: result.nextCursor },
          job.id
        )
      } else if (result.rolloverCursor) {
        await this.queue.persistRollover({
          ...parsed.data,
          cursor: result.rolloverCursor,
        })
      } else if (result.status === 'succeeded' && result.phase === 'objects') {
        await this.queue.resetCheckpoint(
          parsed.data.tenantId,
          parsed.data.pageSize
        )
      }
      const categoryCounts = result.findings.reduce(
        (counts, finding) => {
          counts[finding.category] += 1
          return counts
        },
        {
          terminal_cleanup_incomplete: 0,
          completed_document_inconsistent: 0,
          orphan_reservation_object: 0,
        }
      )
      const findingIdsHash =
        result.findings.length === 0
          ? null
          : createHash('sha256')
              .update(
                result.findings
                  .map(({ reservationId }) => reservationId)
                  .sort()
                  .join(':')
              )
              .digest('hex')
      this.logger.log(
        JSON.stringify({
          event: 'erp.document.upload_reconciliation.job',
          trace_id: traceId,
          tenant_id: tenantId,
          actor_id: null,
          action: 'document.upload_reconciliation',
          outcome: result.status,
          duration_ms: Date.now() - startedAt,
          phase: result.phase,
          scanned_total: result.scanned,
          reported_total: result.findings.length,
          terminal_cleanup_incomplete_total:
            categoryCounts.terminal_cleanup_incomplete,
          completed_document_inconsistent_total:
            categoryCounts.completed_document_inconsistent,
          orphan_reservation_object_total:
            categoryCounts.orphan_reservation_object,
          finding_ids_hash: findingIdsHash,
          has_more: Boolean(result.nextCursor || result.rolloverCursor),
          rollover_scheduled: Boolean(result.rolloverCursor),
        })
      )
      return result
    } catch {
      this.logger.error(
        JSON.stringify({
          event: 'erp.document.upload_reconciliation.job',
          trace_id: traceId,
          tenant_id: tenantId,
          actor_id: null,
          action: 'document.upload_reconciliation',
          outcome: 'failed',
          duration_ms: Date.now() - startedAt,
          error_code: 'DOCUMENT_UPLOAD_RECONCILIATION_JOB_FAILED',
        })
      )
      throw new Error('Document upload reconciliation failed')
    }
  }
}
