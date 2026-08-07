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
  cortexSemanticIndexQueueJobSchema,
  cortexSemanticIndexRecoveryJobSchema,
  type CortexSemanticIndexQueueJob,
  type CortexSemanticIndexRecoveryJob,
} from '@third-code-erp/shared-types'
import type { Queue } from 'bullmq'
import {
  CORTEX_SEMANTIC_INDEX_ATTEMPTS,
  CORTEX_SEMANTIC_INDEX_BACKOFF_MS,
  CORTEX_SEMANTIC_INDEX_JOB,
  CORTEX_SEMANTIC_INDEX_QUEUE,
  CORTEX_SEMANTIC_INDEX_RECOVERY_INTERVAL_MS,
  CORTEX_SEMANTIC_INDEX_RECOVERY_JOB,
  CORTEX_SEMANTIC_INDEX_RECOVERY_SCHEDULER,
  CORTEX_SEMANTIC_INDEX_STALE_AFTER_MS,
  cortexSemanticIndexTransportJobId,
} from './cortex-semantic-index.constants'
import { CortexSemanticIndexStateService } from './cortex-semantic-index.state'

@Injectable()
export class CortexSemanticIndexJobQueue implements OnApplicationBootstrap {
  private readonly logger = new Logger(CortexSemanticIndexJobQueue.name)

  constructor(
    @InjectQueue(CORTEX_SEMANTIC_INDEX_QUEUE)
    private readonly queue: Queue<
      CortexSemanticIndexQueueJob | CortexSemanticIndexRecoveryJob,
      unknown,
      string
    >,
    @Optional()
    @Inject(CortexSemanticIndexStateService)
    private readonly state?: CortexSemanticIndexStateService,
    @Optional()
    @Inject(ConfigService)
    private readonly config?: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const tenantIds = this.scopedRecoveryTenantIds()
    if (tenantIds.length === 0) return
    await this.queue.upsertJobScheduler(
      CORTEX_SEMANTIC_INDEX_RECOVERY_SCHEDULER,
      { every: CORTEX_SEMANTIC_INDEX_RECOVERY_INTERVAL_MS },
      {
        name: CORTEX_SEMANTIC_INDEX_RECOVERY_JOB,
        data: cortexSemanticIndexRecoveryJobSchema.parse({ schemaVersion: 1 }),
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 },
      }
    )
    this.logger.log(
      `Cortex semantic index recovery enabled for ${tenantIds.length} tenant scope(s)`
    )
  }

  async enqueue(jobId: string): Promise<boolean> {
    const data = cortexSemanticIndexQueueJobSchema.parse({
      schemaVersion: 1,
      jobId,
    })
    const transportJobId = cortexSemanticIndexTransportJobId(data.jobId)
    if (await this.queue.getJob(transportJobId)) return false
    try {
      await this.queue.add(CORTEX_SEMANTIC_INDEX_JOB, data, {
        jobId: transportJobId,
        attempts: CORTEX_SEMANTIC_INDEX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: CORTEX_SEMANTIC_INDEX_BACKOFF_MS,
        },
        removeOnComplete: 1_000,
        removeOnFail: false,
      })
    } catch (error) {
      if (await this.queue.getJob(transportJobId)) return false
      throw error
    }
    return true
  }

  async enqueuePending(tenantIds: readonly string[]): Promise<number> {
    if (!this.state) throw new Error('Cortex semantic index state is unavailable')
    const scopedTenantIds = [...new Set(tenantIds)]
    if (scopedTenantIds.length === 0) {
      throw new Error('Cortex semantic index recovery tenant scope is required')
    }
    const before = new Date(Date.now() - CORTEX_SEMANTIC_INDEX_STALE_AFTER_MS)
    const jobIds = await this.state.recoverableJobIds(before, scopedTenantIds)
    let enqueued = 0
    for (const jobId of jobIds) {
      if (await this.enqueue(jobId)) enqueued += 1
    }
    return enqueued
  }

  scopedRecoveryTenantIds(): string[] {
    if (
      this.config?.get<boolean>(
        'ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_ENABLED',
        false
      ) !== true ||
      this.config?.get<boolean>(
        'ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED',
        false
      ) !== true ||
      this.config?.get<boolean>(
        'ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED',
        false
      ) !== true
    ) {
      return []
    }
    const recovery = this.config.get<string[]>(
      'ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_TENANT_IDS',
      []
    )
    const jobs = new Set(
      this.config.get<string[]>('ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS', [])
    )
    const workers = new Set(
      this.config.get<string[]>('ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS', [])
    )
    return [...new Set(recovery)].filter(
      (tenantId) => jobs.has(tenantId) && workers.has(tenantId)
    )
  }
}
