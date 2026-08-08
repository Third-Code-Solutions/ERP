import { InjectQueue } from '@nestjs/bullmq'
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  cortexAssistantProviderCircuitAlertQueueJobSchema,
  cortexAssistantProviderCircuitAlertRecoveryJobSchema,
  type CortexAssistantProviderCircuitAlertEvent,
  type CortexAssistantProviderCircuitAlertQueueJob,
  type CortexAssistantProviderCircuitAlertRecoveryJob,
} from '@third-code-erp/shared-types'
import type { Queue } from 'bullmq'
import {
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ATTEMPTS,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_BACKOFF_MS,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_QUEUE,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_BATCH_SIZE,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_INTERVAL_MS,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_STALE_AFTER_MS,
  cortexAssistantProviderCircuitAlertTransportJobId,
} from './cortex-assistant-provider-circuit-alert.constants'
import { CortexAssistantProviderCircuitAlertService } from './cortex-assistant-provider-circuit-alert.service'

type CortexAssistantProviderCircuitAlertTransportJob =
  | CortexAssistantProviderCircuitAlertQueueJob
  | CortexAssistantProviderCircuitAlertRecoveryJob

@Injectable()
export class CortexAssistantProviderCircuitAlertQueue
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(
    CortexAssistantProviderCircuitAlertQueue.name
  )

  constructor(
    @InjectQueue(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_QUEUE)
    private readonly queue: Queue<
      CortexAssistantProviderCircuitAlertTransportJob,
      unknown,
      string
    >,
    @Inject(CortexAssistantProviderCircuitAlertService)
    private readonly alerts: CortexAssistantProviderCircuitAlertService,
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const tenantIds = this.scopedRecoveryTenantIds()
    if (tenantIds.length === 0) return
    await this.queue.upsertJobScheduler(
      CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
      { every: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_INTERVAL_MS },
      {
        name: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB,
        data: cortexAssistantProviderCircuitAlertRecoveryJobSchema.parse({
          schemaVersion: 1,
        }),
        opts: { attempts: 1, removeOnComplete: 100, removeOnFail: 1_000 },
      }
    )
    this.logger.log(
      `Cortex provider circuit alert recovery enabled for ${tenantIds.length} tenant scope(s)`
    )
  }

  async enqueue(event: CortexAssistantProviderCircuitAlertEvent): Promise<boolean> {
    if (!this.intakeAllowed(event.tenantId)) return false
    const data = cortexAssistantProviderCircuitAlertQueueJobSchema.parse({
      schemaVersion: 1,
      eventKey: event.eventKey,
    })
    return this.enqueueEventKey(data.eventKey)
  }

  async enqueuePending(tenantIds: readonly string[]): Promise<number> {
    const scopedTenantIds = [...new Set(tenantIds)]
    if (scopedTenantIds.length === 0) {
      throw new Error('Cortex provider circuit alert tenant scope is required')
    }
    const events = await this.alerts.recoverableEventKeys(
      new Date(
        Date.now() - CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_STALE_AFTER_MS
      ),
      scopedTenantIds,
      CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_BATCH_SIZE
    )
    let enqueued = 0
    for (const event of events) {
      if (!this.intakeAllowed(event.tenantId)) continue
      if (await this.enqueueEventKey(event.eventKey)) enqueued += 1
    }
    return enqueued
  }

  workerAllowed(tenantId: string): boolean {
    return this.intakeAllowed(tenantId)
  }

  scopedRecoveryTenantIds(): string[] {
    if (
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_ENABLED',
        false
      ) !== true
      ||
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_ENABLED',
        false
      ) !== true
      ||
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_ENABLED',
        false
      ) !== true
      ||
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED',
        false
      ) !== true
    ) {
      return []
    }
    const recovery = this.config.get<string[]>(
      'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_TENANT_IDS',
      []
    )
    const jobs = new Set(
      this.config.get<string[]>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_TENANT_IDS',
        []
      )
    )
    const workers = new Set(
      this.config.get<string[]>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_TENANT_IDS',
        []
      )
    )
    const routes = new Set(
      this.config.get<string[]>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS',
        []
      )
    )
    return [...new Set(recovery)].filter(
      (tenantId) => jobs.has(tenantId) && workers.has(tenantId) && routes.has(tenantId)
    )
  }

  private intakeAllowed(tenantId: string): boolean {
    return (
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_ENABLED',
        false
      ) === true &&
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_ENABLED',
        false
      ) === true &&
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED',
        false
      ) === true &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_TENANT_IDS',
          []
        )
        .includes(tenantId) &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_TENANT_IDS',
          []
        )
        .includes(tenantId) &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS',
          []
        )
        .includes(tenantId)
    )
  }

  private async enqueueEventKey(eventKey: string): Promise<boolean> {
    const data = cortexAssistantProviderCircuitAlertQueueJobSchema.parse({
      schemaVersion: 1,
      eventKey,
    })
    const jobId = cortexAssistantProviderCircuitAlertTransportJobId(eventKey)
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state !== 'completed' && state !== 'failed') return false
      await existing.remove()
    }
    try {
      await this.queue.add(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB, data, {
        jobId,
        attempts: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_BACKOFF_MS,
        },
        removeOnComplete: 1_000,
        removeOnFail: false,
      })
    } catch (error) {
      if (await this.queue.getJob(jobId)) return false
      throw error
    }
    return true
  }
}
