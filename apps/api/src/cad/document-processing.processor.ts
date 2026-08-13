import {
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq'
import { Inject, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  documentProcessingQueueJobSchema,
  documentProcessingRecoveryJobSchema,
  type CadEvidenceCommitCommand,
} from '@third-code-erp/shared-types'
import type { Job } from 'bullmq'
import { CadEvidenceCommitService } from './cad-evidence-commit.service'
import type { DraftBomCommitContext } from './document-processing.bom'
import { DocumentProcessingEvidenceService } from './document-processing.evidence'
import {
  DOCUMENT_PROCESSING_ATTEMPTS,
  DOCUMENT_PROCESSING_JOB,
  DOCUMENT_PROCESSING_QUEUE,
  DOCUMENT_PROCESSING_RECOVERY_JOB,
  DOCUMENT_PROCESSING_RECOVERY_SCHEDULER,
} from './document-processing.constants'
import { DocumentProcessingJobQueue } from './document-processing.queue'
import {
  DocumentProcessingWorkerClient,
  DocumentProcessingWorkerError,
} from './document-processing.worker'
import { DocumentProcessingStateService } from './document-processing.state'

export interface DocumentProcessingProcessorResult {
  status: 'succeeded' | 'ignored'
  jobId: string
  scopeItemsCreated?: number
  recoveredJobs?: number
  draftBomId?: string
  sourceSha256?: string
}

@Processor(DOCUMENT_PROCESSING_QUEUE)
export class DocumentProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessingProcessor.name)

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DocumentProcessingStateService)
    private readonly state: DocumentProcessingStateService,
    @Inject(DocumentProcessingWorkerClient)
    private readonly workerClient: DocumentProcessingWorkerClient,
    @Inject(CadEvidenceCommitService)
    private readonly commits: CadEvidenceCommitService,
    @Inject(DocumentProcessingEvidenceService)
    private readonly evidence: DocumentProcessingEvidenceService,
    @Optional()
    @Inject(DocumentProcessingJobQueue)
    private readonly queue?: DocumentProcessingJobQueue
  ) {
    super()
  }

  async process(
    job: Job<unknown, DocumentProcessingProcessorResult, string>
  ): Promise<DocumentProcessingProcessorResult> {
    if (job.name === DOCUMENT_PROCESSING_RECOVERY_JOB) {
      const parsed = documentProcessingRecoveryJobSchema.safeParse(job.data)
      if (!parsed.success) {
        throw new Error('Invalid document processing recovery job data')
      }

      const enabled = this.config.get<boolean>(
        'ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED',
        false
      )
      const jobsEnabled = this.config.get<boolean>(
        'ERP_DOCUMENT_PROCESSING_JOBS_ENABLED',
        false
      )
      const bridgeEnabled = this.config.get<boolean>(
        'ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED',
        false
      )
      const commitEnabled = this.config.get<boolean>(
        'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED',
        false
      )
      const recoveryTenantIds = this.config.get<string[]>(
        'ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS',
        []
      )
      const jobTenantSet = new Set(
        this.config.get<string[]>('ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS', [])
      )
      const commitTenantSet = new Set(
        this.config.get<string[]>(
          'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS',
          []
        )
      )
      const tenantIds = [...new Set(recoveryTenantIds)].filter((tenantId) =>
        jobTenantSet.has(tenantId) && commitTenantSet.has(tenantId)
      )
      if (
        !enabled ||
        !jobsEnabled ||
        !bridgeEnabled ||
        !commitEnabled ||
        tenantIds.length === 0
      ) {
        return {
          status: 'ignored',
          jobId: DOCUMENT_PROCESSING_RECOVERY_SCHEDULER,
        }
      }
      if (!this.queue) {
        throw new Error('Document processing recovery queue is unavailable')
      }

      const enqueued = await this.queue.enqueuePending(tenantIds)
      this.logger.log(
        `Document processing recovery enqueued ${enqueued} job(s) for ${tenantIds.length} tenant scope(s)`
      )
      return {
        status: 'succeeded',
        jobId: DOCUMENT_PROCESSING_RECOVERY_SCHEDULER,
        recoveredJobs: enqueued,
      }
    }

    if (job.name !== DOCUMENT_PROCESSING_JOB) {
      throw new Error(`Unsupported document processing job: ${job.name}`)
    }
    const parsed = documentProcessingQueueJobSchema.safeParse(job.data)
    if (!parsed.success) {
      throw new Error('Invalid document processing job data')
    }

    const claimed = await this.state.claim(parsed.data.jobId)
    if (!claimed) {
      return { status: 'ignored', jobId: parsed.data.jobId }
    }

    const jobsEnabled = this.config.get<boolean>(
      'ERP_DOCUMENT_PROCESSING_JOBS_ENABLED',
      false
    )
    const bridgeEnabled = this.config.get<boolean>(
      'ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED',
      false
    )
    const jobsTenantAllowed = this.config
      .get<string[]>('ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS', [])
      .includes(claimed.tenantId)
    const commitEnabled = this.config.get<boolean>(
      'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED',
      false
    )
    const commitTenantAllowed = this.config
      .get<string[]>('ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS', [])
      .includes(claimed.tenantId)
    if (
      !jobsEnabled ||
      !bridgeEnabled ||
      !jobsTenantAllowed ||
      !commitEnabled ||
      !commitTenantAllowed
    ) {
      throw new DocumentProcessingWorkerError('processing_bridge_disabled')
    }
    const draftBomEnabled = this.config.get<boolean>(
      'ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED',
      false
    )
    const draftBomTenantAllowed = this.config
      .get<string[]>('ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS', [])
      .includes(claimed.tenantId)
    if (
      claimed.createDraftBom &&
      (!draftBomEnabled || !draftBomTenantAllowed)
    ) {
      throw new DocumentProcessingWorkerError('draft_bom_disabled')
    }

    const extracted = await this.workerClient.extract(claimed)
    const evidenceId = await this.evidence.persist(claimed, extracted)
    const draftBomContext: DraftBomCommitContext | undefined =
      claimed.createDraftBom
        ? {
            job: claimed,
            result: extracted,
            evidenceId,
          }
        : undefined
    const command: CadEvidenceCommitCommand = {
      projectId: claimed.projectId,
      workerResponse: extracted.response,
    }
    const commit = await this.commits.commit(
      claimed.documentId,
      command,
      {
        userId: claimed.createdBy,
        tenantId: claimed.tenantId,
        role: claimed.role,
        email: claimed.email,
      },
      `document-processing:${claimed.jobId}`,
      draftBomContext
    )
    const draftBomId = draftBomContext?.draftBomId
    if (claimed.createDraftBom && !draftBomId) {
      throw new DocumentProcessingWorkerError('draft_bom_not_created')
    }
    await this.state.succeed(
      claimed.jobId,
      commit.scopeItemsCreated,
      extracted.response.warnings,
      draftBomId
    )
    return {
      status: 'succeeded',
      jobId: claimed.jobId,
      scopeItemsCreated: commit.scopeItemsCreated,
      draftBomId,
      sourceSha256: extracted.sourceSha256,
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<unknown, DocumentProcessingProcessorResult, string> | undefined,
    error: Error
  ): Promise<void> {
    if (!job || job.name !== DOCUMENT_PROCESSING_JOB) return
    const attempts =
      typeof job.opts.attempts === 'number'
        ? job.opts.attempts
        : DOCUMENT_PROCESSING_ATTEMPTS
    if (job.attemptsMade < attempts) return
    const parsed = documentProcessingQueueJobSchema.safeParse(job.data)
    if (!parsed.success) return
    const code =
      error instanceof DocumentProcessingWorkerError
        ? error.code
        : 'processing_failed'
    await this.state.fail(parsed.data.jobId, code)
    this.logger.error(
      `Document processing moved to failed state: ${parsed.data.jobId} (${code})`
    )
  }
}
