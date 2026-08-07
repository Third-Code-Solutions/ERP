import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cortexSemanticIndexQueueJobSchema,
  cortexSemanticIndexRecoveryJobSchema,
} from '@third-code-erp/shared-types'
import type { Job } from 'bullmq'
import { ProviderQuotaService } from '../observability/provider-quota.service'
import {
  CORTEX_SEMANTIC_INDEX_ATTEMPTS,
  CORTEX_SEMANTIC_INDEX_JOB,
  CORTEX_SEMANTIC_INDEX_QUEUE,
  CORTEX_SEMANTIC_INDEX_RECOVERY_JOB,
  CORTEX_SEMANTIC_INDEX_RECOVERY_SCHEDULER,
} from './cortex-semantic-index.constants'
import { CortexSemanticIndexJobQueue } from './cortex-semantic-index.queue'
import { CortexSemanticIndexStateService } from './cortex-semantic-index.state'
import {
  CortexSemanticIndexWorkerClient,
  CortexSemanticIndexWorkerError,
} from './cortex-semantic-index.worker'

export interface CortexSemanticIndexProcessorResult {
  status: 'succeeded' | 'ignored'
  jobId: string
  processedNodes?: number
  recoveredJobs?: number
}

@Processor(CORTEX_SEMANTIC_INDEX_QUEUE)
export class CortexSemanticIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(CortexSemanticIndexProcessor.name)

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CortexSemanticIndexStateService)
    private readonly state: CortexSemanticIndexStateService,
    @Inject(CortexSemanticIndexWorkerClient)
    private readonly workerClient: CortexSemanticIndexWorkerClient,
    @Inject(ProviderQuotaService)
    private readonly quota: ProviderQuotaService,
    @Optional()
    @Inject(CortexSemanticIndexJobQueue)
    private readonly queue?: CortexSemanticIndexJobQueue
  ) {
    super()
  }

  async process(
    job: Job<unknown, CortexSemanticIndexProcessorResult, string>
  ): Promise<CortexSemanticIndexProcessorResult> {
    if (job.name === CORTEX_SEMANTIC_INDEX_RECOVERY_JOB) {
      const parsed = cortexSemanticIndexRecoveryJobSchema.safeParse(job.data)
      if (!parsed.success) throw new Error('Invalid semantic index recovery data')
      const tenantIds = this.queue?.scopedRecoveryTenantIds() ?? []
      if (!this.queue || tenantIds.length === 0) {
        return {
          status: 'ignored',
          jobId: CORTEX_SEMANTIC_INDEX_RECOVERY_SCHEDULER,
        }
      }
      const recoveredJobs = await this.queue.enqueuePending(tenantIds)
      return {
        status: 'succeeded',
        jobId: CORTEX_SEMANTIC_INDEX_RECOVERY_SCHEDULER,
        recoveredJobs,
      }
    }

    if (job.name !== CORTEX_SEMANTIC_INDEX_JOB) {
      throw new Error(`Unsupported Cortex semantic index job: ${job.name}`)
    }
    const parsed = cortexSemanticIndexQueueJobSchema.safeParse(job.data)
    if (!parsed.success) throw new Error('Invalid semantic index job data')

    const claimed = await this.state.claim(parsed.data.jobId)
    if (!claimed) return { status: 'ignored', jobId: parsed.data.jobId }

    if (!this.workerAllowed(claimed.tenantId)) {
      await this.state.fail(claimed.jobId, 'semantic_index_worker_disabled')
      return { status: 'ignored', jobId: claimed.jobId }
    }

    const decision = await this.quota.consume('provider-embedding', {
      tenantId: claimed.tenantId,
      userId: claimed.requestedBy,
    })
    if (!decision.allowed) {
      throw new CortexSemanticIndexWorkerError('provider_quota_exceeded')
    }

    const reserved = await this.state.reserveProviderCall(claimed.jobId)
    if (!reserved) {
      await this.state.fail(claimed.jobId, 'provider_call_not_reserved')
      return { status: 'ignored', jobId: claimed.jobId }
    }

    let vectors: number[][]
    try {
      vectors = await this.workerClient.embed(
        claimed.nodes.map((node) => node.text)
      )
    } catch (error) {
      const code =
        error instanceof CortexSemanticIndexWorkerError
          ? error.code
          : 'provider_call_outcome_unknown'
      await this.state.fail(claimed.jobId, code)
      throw error
    }

    const processedNodes = await this.state.succeed(
      claimed.jobId,
      claimed.tenantId,
      claimed.nodes.map((node) => node.id),
      vectors
    )
    return {
      status: 'succeeded',
      jobId: claimed.jobId,
      processedNodes,
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<unknown, CortexSemanticIndexProcessorResult, string> | undefined,
    error: Error
  ): Promise<void> {
    if (!job || job.name !== CORTEX_SEMANTIC_INDEX_JOB) return
    const attempts =
      typeof job.opts.attempts === 'number'
        ? job.opts.attempts
        : CORTEX_SEMANTIC_INDEX_ATTEMPTS
    if (job.attemptsMade < attempts) return
    const parsed = cortexSemanticIndexQueueJobSchema.safeParse(job.data)
    if (!parsed.success) return
    const code =
      error instanceof CortexSemanticIndexWorkerError
        ? error.code
        : 'semantic_index_failed'
    await this.state.fail(parsed.data.jobId, code)
    this.logger.error(
      `Cortex semantic index moved to failed: ${parsed.data.jobId} (${code})`
    )
  }

  private workerAllowed(tenantId: string): boolean {
    return (
      this.config.get<boolean>(
        'ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED',
        false
      ) === true &&
      this.config.get<boolean>(
        'ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED',
        false
      ) === true &&
      this.config
        .get<string[]>('ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS', [])
        .includes(tenantId) &&
      this.config
        .get<string[]>('ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS', [])
        .includes(tenantId)
    )
  }
}
