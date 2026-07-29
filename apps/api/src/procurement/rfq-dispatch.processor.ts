import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import {
  rfqDispatchDeadLetterSchema,
  rfqDispatchJobSchema,
  type RfqCreationResult,
  type RfqDispatchDeadLetter,
} from '@third-code-erp/shared-types'
import type { Job, Queue } from 'bullmq'
import {
  RFQ_DISPATCH_DEAD_LETTER_JOB,
  RFQ_DISPATCH_DEAD_LETTER_QUEUE,
  RFQ_DISPATCH_JOB,
  RFQ_DISPATCH_QUEUE,
} from './rfq-dispatch.constants'
import { ProcurementService } from './procurement.service'

@Processor(RFQ_DISPATCH_QUEUE)
export class RfqDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(RfqDispatchProcessor.name)

  constructor(
    @Inject(ProcurementService)
    private readonly procurement: ProcurementService,
    @InjectQueue(RFQ_DISPATCH_DEAD_LETTER_QUEUE)
    private readonly deadLetterQueue: Queue<
      RfqDispatchDeadLetter,
      void,
      string
    >
  ) {
    super()
  }

  async process(
    job: Job<unknown, RfqCreationResult, string>
  ): Promise<RfqCreationResult> {
    if (job.name !== RFQ_DISPATCH_JOB) {
      throw new Error(`Unsupported RFQ dispatch job: ${job.name}`)
    }
    const parsed = rfqDispatchJobSchema.safeParse(job.data)
    if (!parsed.success) {
      throw new Error('Invalid RFQ dispatch job data')
    }
    return this.procurement.createFromApprovedBom(parsed.data)
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<unknown, RfqCreationResult, string> | undefined,
    error: Error
  ): Promise<void> {
    if (!job?.id) return
    const attempts =
      typeof job.opts.attempts === 'number'
        ? job.opts.attempts
        : 1
    if (job.attemptsMade < attempts) return

    const deadLetter = rfqDispatchDeadLetterSchema.parse({
      schemaVersion: 1,
      sourceJobId: job.id,
      sourceJobName: job.name.slice(0, 100),
      jobData: job.data,
      attemptsMade: job.attemptsMade,
      errorName: (error.name || 'Error').slice(0, 100),
      errorMessage: (
        error.message || 'Unknown RFQ dispatch failure'
      ).slice(0, 1_000),
      failedAt: new Date().toISOString(),
    })

    await this.deadLetterQueue.add(
      RFQ_DISPATCH_DEAD_LETTER_JOB,
      deadLetter,
      {
        jobId: `${job.id}-dead-letter`,
        attempts: 1,
        removeOnComplete: 5_000,
        removeOnFail: false,
      }
    )
    this.logger.error(
      `RFQ dispatch moved to dead letter: ${job.id}`
    )
  }
}
