import { Processor, WorkerHost } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { Inject } from '@nestjs/common'
import {
  cortexAssistantGenerationQueueJobSchema,
  cortexAssistantGenerationRecoveryJobSchema,
} from '@third-code-erp/shared-types'
import type { Job } from 'bullmq'
import {
  CORTEX_ASSISTANT_GENERATION_JOB,
  CORTEX_ASSISTANT_GENERATION_QUEUE,
  CORTEX_ASSISTANT_GENERATION_RECOVERY_JOB,
  CORTEX_ASSISTANT_GENERATION_RECOVERY_SCHEDULER,
} from './cortex-assistant-generation.constants'
import { CortexAssistantGenerationJobQueue } from './cortex-assistant-generation.queue'
import { CortexAssistantGenerationStateService } from './cortex-assistant-generation.state'
import {
  CortexAssistantGenerationWorkerClient,
  CortexAssistantGenerationWorkerError,
} from './cortex-assistant-generation.worker'
import { CortexAssistantTurnsService } from './cortex-assistant-turns.service'

export interface CortexAssistantGenerationProcessorResult {
  status: 'succeeded' | 'ignored'
  jobId: string
  recoveredJobs?: number
}

@Processor(CORTEX_ASSISTANT_GENERATION_QUEUE)
export class CortexAssistantGenerationProcessor extends WorkerHost {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(CortexAssistantGenerationStateService)
    private readonly state: CortexAssistantGenerationStateService,
    @Inject(CortexAssistantGenerationWorkerClient)
    private readonly workerClient: CortexAssistantGenerationWorkerClient,
    @Inject(CortexAssistantTurnsService)
    private readonly assistantTurns: CortexAssistantTurnsService,
    @Inject(CortexAssistantGenerationJobQueue)
    private readonly queue: CortexAssistantGenerationJobQueue
  ) {
    super()
  }

  async process(
    job: Job<unknown, CortexAssistantGenerationProcessorResult, string>
  ): Promise<CortexAssistantGenerationProcessorResult> {
    if (job.name === CORTEX_ASSISTANT_GENERATION_RECOVERY_JOB) {
      const parsed = cortexAssistantGenerationRecoveryJobSchema.safeParse(
        job.data
      )
      if (!parsed.success) {
        throw new Error('Invalid assistant generation recovery data')
      }
      const tenantIds = this.queue.scopedRecoveryTenantIds()
      if (tenantIds.length === 0) {
        return {
          status: 'ignored',
          jobId: CORTEX_ASSISTANT_GENERATION_RECOVERY_SCHEDULER,
        }
      }
      return {
        status: 'succeeded',
        jobId: CORTEX_ASSISTANT_GENERATION_RECOVERY_SCHEDULER,
        recoveredJobs: await this.queue.enqueuePending(tenantIds),
      }
    }
    if (job.name !== CORTEX_ASSISTANT_GENERATION_JOB) {
      throw new Error(`Unsupported assistant generation job: ${job.name}`)
    }
    const parsed = cortexAssistantGenerationQueueJobSchema.safeParse(job.data)
    if (!parsed.success) throw new Error('Invalid assistant generation job data')

    const claimed = await this.state.claim(parsed.data.jobId)
    if (!claimed) return { status: 'ignored', jobId: parsed.data.jobId }
    if (!this.workerAllowed(claimed.tenantId)) {
      await this.state.failTerminal(
        claimed.jobId,
        claimed.claimTokenHash,
        'generation_worker_disabled'
      )
      return { status: 'ignored', jobId: claimed.jobId }
    }

    try {
      const output = await this.workerClient.generate(
        claimed.question,
        claimed.evidence
      )
      const completed = await this.assistantTurns.completeFromWorker({
        jobId: claimed.jobId,
        requestId: claimed.requestId,
        claimTokenHash: claimed.claimTokenHash,
        content: output.content,
        citationNodeIds: output.citationNodeIds,
        model: output.model,
      })
      if (!completed) {
        await this.state.failTerminal(
          claimed.jobId,
          claimed.claimTokenHash,
          'claim_fence_changed'
        )
        return { status: 'ignored', jobId: claimed.jobId }
      }
      return { status: 'succeeded', jobId: claimed.jobId }
    } catch (error) {
      const code =
        error instanceof CortexAssistantGenerationWorkerError
          ? error.code
          : 'assistant_generation_failed'
      await this.state.retryOrFail(
        claimed.jobId,
        claimed.claimTokenHash,
        code
      )
      throw error
    }
  }

  private workerAllowed(tenantId: string): boolean {
    return (
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED',
        false
      ) === true &&
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED',
        false
      ) === true &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS',
          []
        )
        .includes(tenantId) &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS',
          []
        )
        .includes(tenantId)
    )
  }
}
