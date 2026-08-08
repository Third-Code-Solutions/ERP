import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Inject, Logger, Optional } from '@nestjs/common'
import {
  cortexAssistantProviderCircuitAlertQueueJobSchema,
  cortexAssistantProviderCircuitAlertRecoveryJobSchema,
  type CortexAssistantProviderCircuitAlertRouteAdapter,
} from '@third-code-erp/shared-types'
import type { Job } from 'bullmq'
import {
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ATTEMPTS,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_QUEUE,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTE_ADAPTER,
} from './cortex-assistant-provider-circuit-alert.constants'
import {
  CortexAssistantProviderCircuitAlertRouteError,
  CortexAssistantProviderCircuitAlertRouter,
} from './cortex-assistant-provider-circuit-alert-router'
import { CortexAssistantProviderCircuitAlertQueue } from './cortex-assistant-provider-circuit-alert.queue'
import { CortexAssistantProviderCircuitAlertService } from './cortex-assistant-provider-circuit-alert.service'

export interface CortexAssistantProviderCircuitAlertProcessorResult {
  status: 'succeeded' | 'ignored'
  eventKey: string
  recoveredJobs?: number
}

export class CortexAssistantProviderCircuitAlertQueueError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'CortexAssistantProviderCircuitAlertQueueError'
  }
}

const DISABLED_ROUTE_ADAPTER: CortexAssistantProviderCircuitAlertRouteAdapter =
  {
    key: 'local-disabled',
    async publish(): Promise<void> {
      throw new CortexAssistantProviderCircuitAlertRouteError(
        'route_unavailable'
      )
    },
  }

@Processor(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_QUEUE)
export class CortexAssistantProviderCircuitAlertProcessor extends WorkerHost {
  private readonly logger = new Logger(
    CortexAssistantProviderCircuitAlertProcessor.name
  )

  constructor(
    @Inject(CortexAssistantProviderCircuitAlertService)
    private readonly alerts: CortexAssistantProviderCircuitAlertService,
    @Inject(CortexAssistantProviderCircuitAlertRouter)
    private readonly router: CortexAssistantProviderCircuitAlertRouter,
    @Inject(CortexAssistantProviderCircuitAlertQueue)
    private readonly queue: CortexAssistantProviderCircuitAlertQueue,
    @Optional()
    @Inject(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTE_ADAPTER)
    private readonly adapter?: CortexAssistantProviderCircuitAlertRouteAdapter
  ) {
    super()
  }

  async process(
    job: Job<unknown, CortexAssistantProviderCircuitAlertProcessorResult, string>
  ): Promise<CortexAssistantProviderCircuitAlertProcessorResult> {
    if (job.name === CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB) {
      const parsed = cortexAssistantProviderCircuitAlertRecoveryJobSchema.safeParse(
        job.data
      )
      if (!parsed.success) {
        throw new Error('Invalid Cortex provider circuit alert recovery data')
      }
      const tenantIds = this.queue.scopedRecoveryTenantIds()
      if (tenantIds.length === 0) {
        return {
          status: 'ignored',
          eventKey: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
        }
      }
      return {
        status: 'succeeded',
        eventKey: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
        recoveredJobs: await this.queue.enqueuePending(tenantIds),
      }
    }
    if (job.name !== CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB) {
      throw new Error(`Unsupported Cortex provider circuit alert job: ${job.name}`)
    }
    const parsed = cortexAssistantProviderCircuitAlertQueueJobSchema.safeParse(
      job.data
    )
    if (!parsed.success) {
      throw new Error('Invalid Cortex provider circuit alert job data')
    }
    const eventKey = parsed.data.eventKey
    const tenantId = await this.alerts.tenantIdForEventKey(eventKey)
    if (!tenantId || !this.queue.workerAllowed(tenantId)) {
      return { status: 'ignored', eventKey }
    }

    const result = await this.alerts.deliverEventKeyThroughRoute(
      eventKey,
      this.router,
      this.adapter ?? DISABLED_ROUTE_ADAPTER
    )
    if (result.status === 'failed') {
      throw new CortexAssistantProviderCircuitAlertQueueError(
        result.failureCode ?? 'route_unknown'
      )
    }
    return {
      status: result.status === 'delivered' ? 'succeeded' : 'ignored',
      eventKey,
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job:
      | Job<
          unknown,
          CortexAssistantProviderCircuitAlertProcessorResult,
          string
        >
      | undefined,
    error: Error
  ): Promise<void> {
    if (!job || job.name !== CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB) return
    const attempts =
      typeof job.opts.attempts === 'number'
        ? job.opts.attempts
        : CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ATTEMPTS
    if (job.attemptsMade < attempts) return
    const parsed = cortexAssistantProviderCircuitAlertQueueJobSchema.safeParse(
      job.data
    )
    if (!parsed.success) return
    const code =
      error instanceof CortexAssistantProviderCircuitAlertQueueError
        ? error.code
        : 'cortex_provider_circuit_alert_failed'
    this.logger.error(
      `Cortex provider circuit alert moved to failed: ${parsed.data.eventKey} (${code})`
    )
  }
}
