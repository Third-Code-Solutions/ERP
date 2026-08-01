import { InjectQueue } from '@nestjs/bullmq'
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  documentProcessingQueueJobSchema,
  documentProcessingRecoveryJobSchema,
  type DocumentProcessingQueueJob,
  type DocumentProcessingRecoveryJob,
} from '@third-code-erp/shared-types'
import type { Job, Queue } from 'bullmq'
import {
  DOCUMENT_PROCESSING_ATTEMPTS,
  DOCUMENT_PROCESSING_BACKOFF_MS,
  DOCUMENT_PROCESSING_JOB,
  DOCUMENT_PROCESSING_QUEUE,
  DOCUMENT_PROCESSING_RECOVERY_INTERVAL_MS,
  DOCUMENT_PROCESSING_RECOVERY_JOB,
  DOCUMENT_PROCESSING_RECOVERY_SCHEDULER,
  DOCUMENT_PROCESSING_STALE_AFTER_MS,
  documentProcessingJobId,
} from './document-processing.constants'
import { DocumentProcessingStateService } from './document-processing.state'

export interface DocumentProcessingEnqueueResult {
  jobId: string
  enqueued: boolean
}

@Injectable()
export class DocumentProcessingJobQueue implements OnApplicationBootstrap {
  private readonly logger = new Logger(DocumentProcessingJobQueue.name)

  constructor(
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly queue: Queue<
      DocumentProcessingQueueJob | DocumentProcessingRecoveryJob,
      unknown,
      string
    >,
    @Optional()
    @Inject(DocumentProcessingStateService)
    private readonly state?: DocumentProcessingStateService,
    @Optional()
    @Inject(ConfigService)
    private readonly config?: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (
      this.config?.get<boolean>(
        'ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED',
        false
      ) !== true
    ) {
      return
    }

    const tenantIds = this.scopedRecoveryTenantIds()
    if (tenantIds.length === 0) {
      this.logger.warn(
        'Document processing recovery scheduler remains disabled: gates or tenant scope are closed'
      )
      return
    }

    await this.queue.upsertJobScheduler(
      DOCUMENT_PROCESSING_RECOVERY_SCHEDULER,
      { every: DOCUMENT_PROCESSING_RECOVERY_INTERVAL_MS },
      {
        name: DOCUMENT_PROCESSING_RECOVERY_JOB,
        data: documentProcessingRecoveryJobSchema.parse({ schemaVersion: 1 }),
        opts: {
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 1_000,
        },
      }
    )
    this.logger.log(
      `Document processing recovery scheduler enabled for ${tenantIds.length} tenant scope(s)`
    )
  }

  async enqueue(jobId: string): Promise<DocumentProcessingEnqueueResult> {
    const parsed = documentProcessingQueueJobSchema.safeParse({
      schemaVersion: 1,
      jobId,
    })
    if (!parsed.success) {
      throw new Error('Invalid document processing job identity')
    }

    const transportJobId = documentProcessingJobId(parsed.data.jobId)
    if (await this.queue.getJob(transportJobId)) {
      return { jobId: parsed.data.jobId, enqueued: false }
    }

    try {
      await this.queue.add(DOCUMENT_PROCESSING_JOB, parsed.data, {
        jobId: transportJobId,
        attempts: DOCUMENT_PROCESSING_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: DOCUMENT_PROCESSING_BACKOFF_MS,
        },
        removeOnComplete: 1_000,
        removeOnFail: false,
      })
    } catch (error) {
      // Another request may have won the get/add race. Re-read the opaque
      // transport identity before surfacing a real Redis failure.
      if (await this.queue.getJob(transportJobId)) {
        return { jobId: parsed.data.jobId, enqueued: false }
      }
      throw error
    }

    return { jobId: parsed.data.jobId, enqueued: true }
  }

  /** Rebuilds missing Redis transport jobs from PostgreSQL-owned state. */
  async enqueuePending(tenantIds: readonly string[]): Promise<number> {
    if (!this.state) {
      throw new Error('Document processing recovery state is unavailable')
    }
    const scopedTenantIds = [...new Set(tenantIds)]
    if (scopedTenantIds.length === 0) {
      throw new Error('Document processing recovery tenant scope is required')
    }
    const staleBefore = new Date(
      Date.now() - DOCUMENT_PROCESSING_STALE_AFTER_MS
    )
    const jobIds = await this.state.recoverableJobIds(
      staleBefore,
      scopedTenantIds
    )
    let enqueued = 0
    for (const jobId of jobIds) {
      const result = await this.enqueue(jobId)
      if (result.enqueued) enqueued += 1
    }
    return enqueued
  }

  private scopedRecoveryTenantIds(): string[] {
    if (
      this.config?.get<boolean>(
        'ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED',
        false
      ) !== true ||
      this.config?.get<boolean>(
        'ERP_DOCUMENT_PROCESSING_JOBS_ENABLED',
        false
      ) !== true
      ||
      this.config?.get<boolean>(
        'ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED',
        false
      ) !== true
      ||
      this.config?.get<boolean>(
        'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED',
        false
      ) !== true
    ) {
      return []
    }
    const recoveryTenantIds = this.config.get<string[]>(
      'ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS',
      []
    )
    const processingTenantIds = this.config.get<string[]>(
      'ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS',
      []
    )
    const commitTenantIds = this.config.get<string[]>(
      'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS',
      []
    )
    const processingTenantSet = new Set(processingTenantIds)
    const commitTenantSet = new Set(commitTenantIds)
    return [...new Set(recoveryTenantIds)].filter((tenantId) =>
      processingTenantSet.has(tenantId) && commitTenantSet.has(tenantId)
    )
  }
}

export type DocumentProcessingQueueJobRecord = Job<
  DocumentProcessingQueueJob,
  void,
  string
>
