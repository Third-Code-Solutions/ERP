import { createHash } from 'node:crypto'

import { InjectQueue } from '@nestjs/bullmq'
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common'
import type { Queue } from 'bullmq'

import {
  decodeDocumentUploadReservationReconciliationCursor,
  documentUploadReservationReconciliationJobSchema,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_PAGE_SIZE,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_QUEUE,
  DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_SCHEDULER_PREFIX,
  type DocumentUploadReservationReconciliationJob,
} from './document-upload-reservation-reconciliation.constants'
import { DocumentUploadReservationReconciliationService } from './document-upload-reservation-reconciliation.service'

@Injectable()
export class DocumentUploadReservationReconciliationQueue
  implements OnApplicationBootstrap
{
  constructor(
    @InjectQueue(DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_QUEUE)
    private readonly queue: Queue<
      DocumentUploadReservationReconciliationJob,
      unknown,
      string
    >,
    @Inject(DocumentUploadReservationReconciliationService)
    private readonly reconciliation: DocumentUploadReservationReconciliationService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const tenantIds = [
      ...new Set(
        this.reconciliation
          .scopedTenantIds()
          .map((tenantId) => tenantId.toLowerCase())
      ),
    ].sort()
    if (tenantIds.length > 0) {
      await this.queue.setGlobalConcurrency(1)
    }
    for (const tenantId of tenantIds) {
      const existing = await this.queue.getJobScheduler(
        this.schedulerId(tenantId)
      )
      if (existing) {
        const parsed = documentUploadReservationReconciliationJobSchema.safeParse(
          existing.template?.data
        )
        if (
          existing.name !== DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB ||
          existing.every !==
            DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS ||
          !parsed.success ||
          parsed.data.tenantId !== tenantId
        ) {
          throw new Error('Invalid document upload reconciliation scheduler')
        }
        if (parsed.data.cursor) {
          const cursor = decodeDocumentUploadReservationReconciliationCursor(
            parsed.data.cursor,
            tenantId
          )
          if (cursor.page !== 1) {
            throw new Error('Invalid document upload reconciliation scheduler')
          }
        }
        continue
      }
      await this.upsertScheduler(
        documentUploadReservationReconciliationJobSchema.parse({
          schemaVersion: 1,
          tenantId,
          pageSize: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_PAGE_SIZE,
        })
      )
    }
  }

  async persistRollover(
    command: DocumentUploadReservationReconciliationJob
  ): Promise<void> {
    const parsed = documentUploadReservationReconciliationJobSchema.parse(command)
    if (!parsed.cursor) {
      throw new Error('Invalid document upload reconciliation rollover')
    }
    const cursor = decodeDocumentUploadReservationReconciliationCursor(
      parsed.cursor,
      parsed.tenantId
    )
    if (cursor.page !== 1) {
      throw new Error('Invalid document upload reconciliation rollover')
    }
    await this.upsertScheduler(parsed)
  }

  async resetCheckpoint(tenantId: string, pageSize: number): Promise<void> {
    await this.upsertScheduler(
      documentUploadReservationReconciliationJobSchema.parse({
        schemaVersion: 1,
        tenantId,
        pageSize,
      })
    )
  }

  async enqueueContinuation(
    command: DocumentUploadReservationReconciliationJob,
    sourceJobId: string
  ): Promise<void> {
    const parsed = documentUploadReservationReconciliationJobSchema.parse(command)
    if (!parsed.cursor || sourceJobId.length === 0 || sourceJobId.length > 512) {
      throw new Error('Invalid document upload reconciliation continuation')
    }
    decodeDocumentUploadReservationReconciliationCursor(
      parsed.cursor,
      parsed.tenantId
    )
    const jobId = createHash('sha256')
      .update(`${sourceJobId}:${parsed.cursor}`)
      .digest('hex')
    await this.queue.add(DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB, parsed, {
      jobId,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 1_000,
    })
  }

  private schedulerId(tenantId: string): string {
    return `${DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_SCHEDULER_PREFIX}-${tenantId}`
  }

  private async upsertScheduler(
    command: DocumentUploadReservationReconciliationJob
  ): Promise<void> {
    await this.queue.upsertJobScheduler(
      this.schedulerId(command.tenantId),
      { every: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS },
      {
        name: DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB,
        data: command,
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 },
      }
    )
  }
}
