import { randomUUID } from 'node:crypto'

import { InjectQueue } from '@nestjs/bullmq'
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common'
import type { Queue } from 'bullmq'

import {
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_INTERVAL_MS,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_QUEUE,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER,
  DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER_REMOVE_TIMEOUT_MS,
  documentUploadReservationCleanupJobSchema,
  type DocumentUploadReservationCleanupJob,
} from './document-upload-reservation-cleanup.constants'
import { DocumentUploadReservationCleanupService } from './document-upload-reservation-cleanup.service'

@Injectable()
export class DocumentUploadReservationCleanupQueue
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(
    DocumentUploadReservationCleanupQueue.name
  )

  constructor(
    @InjectQueue(DOCUMENT_UPLOAD_RESERVATION_CLEANUP_QUEUE)
    private readonly queue: Queue<
      DocumentUploadReservationCleanupJob,
      unknown,
      string
    >,
    @Inject(DocumentUploadReservationCleanupService)
    private readonly cleanup: DocumentUploadReservationCleanupService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.cleanup.scopedTenantIds().length === 0) {
      try {
        await this.removeSchedulerWithinDeadline(
          this.queue.removeJobScheduler(
            DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER
          )
        )
      } catch {
        this.logger.warn(
          JSON.stringify({
            event: 'erp.document.upload_cleanup.scheduler',
            trace_id: randomUUID(),
            tenant_id: null,
            actor_id: null,
            action: 'document.upload_cleanup_scheduler_remove',
            outcome: 'failed',
            error_code: 'SCHEDULER_REMOVE_FAILED',
          })
        )
      }
      return
    }
    await this.queue.upsertJobScheduler(
      DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER,
      { every: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_INTERVAL_MS },
      {
        name: DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB,
        data: documentUploadReservationCleanupJobSchema.parse({
          schemaVersion: 1,
        }),
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 },
      }
    )
  }

  private async removeSchedulerWithinDeadline(
    operation: Promise<boolean>
  ): Promise<void> {
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new Error('scheduler_remove_deadline_exceeded')),
            DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER_REMOVE_TIMEOUT_MS
          )
        }),
      ])
    } finally {
      if (deadline) clearTimeout(deadline)
    }
  }
}
