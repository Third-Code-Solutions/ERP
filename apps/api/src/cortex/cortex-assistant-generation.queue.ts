import { InjectQueue } from '@nestjs/bullmq'
import {
  Injectable,
  Inject,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cortexAssistantGenerationQueueJobSchema,
  cortexAssistantGenerationRecoveryJobSchema,
  type CortexAssistantGenerationQueueJob,
  type CortexAssistantGenerationRecoveryJob,
} from '@third-code-erp/shared-types'
import type { Queue } from 'bullmq'
import {
  CORTEX_ASSISTANT_GENERATION_ATTEMPTS,
  CORTEX_ASSISTANT_GENERATION_BACKOFF_MS,
  CORTEX_ASSISTANT_GENERATION_JOB,
  CORTEX_ASSISTANT_GENERATION_QUEUE,
  CORTEX_ASSISTANT_GENERATION_RECOVERY_INTERVAL_MS,
  CORTEX_ASSISTANT_GENERATION_RECOVERY_JOB,
  CORTEX_ASSISTANT_GENERATION_RECOVERY_SCHEDULER,
  CORTEX_ASSISTANT_GENERATION_STALE_AFTER_MS,
  cortexAssistantGenerationTransportJobId,
} from './cortex-assistant-generation.constants'
import { CortexAssistantGenerationStateService } from './cortex-assistant-generation.state'

@Injectable()
export class CortexAssistantGenerationJobQueue
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(CortexAssistantGenerationJobQueue.name)

  constructor(
    @InjectQueue(CORTEX_ASSISTANT_GENERATION_QUEUE)
    private readonly queue: Queue<
      CortexAssistantGenerationQueueJob | CortexAssistantGenerationRecoveryJob,
      unknown,
      string
    >,
    @Inject(CortexAssistantGenerationStateService)
    private readonly state: CortexAssistantGenerationStateService,
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const tenantIds = this.scopedRecoveryTenantIds()
    if (tenantIds.length === 0) return
    await this.queue.upsertJobScheduler(
      CORTEX_ASSISTANT_GENERATION_RECOVERY_SCHEDULER,
      { every: CORTEX_ASSISTANT_GENERATION_RECOVERY_INTERVAL_MS },
      {
        name: CORTEX_ASSISTANT_GENERATION_RECOVERY_JOB,
        data: cortexAssistantGenerationRecoveryJobSchema.parse({
          schemaVersion: 1,
        }),
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 },
      }
    )
    this.logger.log(
      `Cortex assistant generation recovery enabled for ${tenantIds.length} tenant scope(s)`
    )
  }

  async enqueue(jobId: string): Promise<boolean> {
    const data = cortexAssistantGenerationQueueJobSchema.parse({
      schemaVersion: 1,
      jobId,
    })
    const transportJobId = cortexAssistantGenerationTransportJobId(jobId)
    const existing = await this.queue.getJob(transportJobId)
    if (existing) {
      const state = await existing.getState()
      if (state !== 'completed' && state !== 'failed') return false
      await existing.remove()
    }
    try {
      await this.queue.add(CORTEX_ASSISTANT_GENERATION_JOB, data, {
        jobId: transportJobId,
        attempts: CORTEX_ASSISTANT_GENERATION_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: CORTEX_ASSISTANT_GENERATION_BACKOFF_MS,
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
    const before = new Date(
      Date.now() - CORTEX_ASSISTANT_GENERATION_STALE_AFTER_MS
    )
    const jobIds = await this.state.recoverableJobIds(before, tenantIds)
    let enqueued = 0
    for (const jobId of jobIds) {
      if (await this.enqueue(jobId)) enqueued += 1
    }
    return enqueued
  }

  scopedRecoveryTenantIds(): string[] {
    if (
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED',
        false
      ) !== true ||
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED',
        false
      ) !== true ||
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED',
        false
      ) !== true
    ) {
      return []
    }
    const recovery = this.config.get<string[]>(
      'ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_TENANT_IDS',
      []
    )
    const jobs = new Set(
      this.config.get<string[]>(
        'ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS',
        []
      )
    )
    const workers = new Set(
      this.config.get<string[]>(
        'ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS',
        []
      )
    )
    return [...new Set(recovery)].filter(
      (tenantId) => jobs.has(tenantId) && workers.has(tenantId)
    )
  }
}
