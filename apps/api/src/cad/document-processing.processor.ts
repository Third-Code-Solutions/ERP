import {
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  documentProcessingQueueJobSchema,
  type CadEvidenceCommitCommand,
} from '@third-code-erp/shared-types'
import type { Job } from 'bullmq'
import { CadEvidenceCommitService } from './cad-evidence-commit.service'
import {
  DOCUMENT_PROCESSING_ATTEMPTS,
  DOCUMENT_PROCESSING_JOB,
  DOCUMENT_PROCESSING_QUEUE,
} from './document-processing.constants'
import {
  DocumentProcessingWorkerClient,
  DocumentProcessingWorkerError,
} from './document-processing.worker'
import { DocumentProcessingStateService } from './document-processing.state'

export interface DocumentProcessingProcessorResult {
  status: 'succeeded' | 'ignored'
  jobId: string
  scopeItemsCreated?: number
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
    private readonly commits: CadEvidenceCommitService
  ) {
    super()
  }

  async process(
    job: Job<unknown, DocumentProcessingProcessorResult, string>
  ): Promise<DocumentProcessingProcessorResult> {
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

    if (
      !this.config.get<boolean>(
        'ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED',
        false
      ) ||
      !this.config.get<string[]>('ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS', [])
        .includes(claimed.tenantId) ||
      !this.config.get<boolean>(
        'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED',
        false
      ) ||
      !this.config
        .get<string[]>('ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS', [])
        .includes(claimed.tenantId)
    ) {
      throw new DocumentProcessingWorkerError('processing_bridge_disabled')
    }

    // BOM creation is a separate idempotent Nest command. Refuse a request
    // that asks for it until that command exists; never report a partial
    // success that silently omits the requested BOM.
    if (claimed.createDraftBom) {
      throw new DocumentProcessingWorkerError('draft_bom_not_implemented')
    }

    const extracted = await this.workerClient.extract(claimed)
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
      `document-processing:${claimed.jobId}`
    )
    await this.state.succeed(
      claimed.jobId,
      commit.scopeItemsCreated,
      extracted.response.warnings
    )
    return {
      status: 'succeeded',
      jobId: claimed.jobId,
      scopeItemsCreated: commit.scopeItemsCreated,
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
