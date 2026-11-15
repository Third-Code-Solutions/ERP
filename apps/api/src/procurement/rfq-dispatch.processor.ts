import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq'
import { HttpException, HttpStatus, Inject, Logger } from '@nestjs/common'
import {
  rfqDispatchDeadLetterSchema,
  rfqDispatchJobSchema,
  type RfqCreationResult,
  type RfqDispatchDeadLetter,
} from '@third-code-erp/shared-types'
import { UnrecoverableError, type Job, type Queue } from 'bullmq'
import {
  RFQ_DISPATCH_DEAD_LETTER_JOB,
  RFQ_DISPATCH_DEAD_LETTER_QUEUE,
  RFQ_DISPATCH_JOB,
  RFQ_DISPATCH_QUEUE,
} from './rfq-dispatch.constants'
import { ProcurementService, RfqNotNeededException } from './procurement.service'
import { NotificationDeliveryQueue } from './notification-delivery.queue'

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
    >,
    @Inject(NotificationDeliveryQueue)
    private readonly notificationQueue: NotificationDeliveryQueue
  ) {
    super()
  }

  async process(
    job: Job<unknown, RfqCreationResult | null, string>
  ): Promise<RfqCreationResult | null> {
    if (job.name !== RFQ_DISPATCH_JOB) {
      throw new Error(`Unsupported RFQ dispatch job: ${job.name}`)
    }
    const parsed = rfqDispatchJobSchema.safeParse(job.data)
    if (!parsed.success) {
      throw new Error('Invalid RFQ dispatch job data')
    }
    const result = await this.procurement
      .createFromApprovedBom(parsed.data)
      .catch((error: unknown) => {
        // Every line has a contracted rate: a normal outcome, so the job is done.
        if (error instanceof RfqNotNeededException) return null
        // A 4xx is the BOM's or actor's settled state (gone, retired, no longer
        // approved, no lines, no role); retrying cannot change it.
        // shortcut: every 4xx but 408/429 counts as settled; if createRecord ever
        // maps a lock timeout to 409 (as claim services do), exempt it here.
        if (
          error instanceof HttpException &&
          error.getStatus() < 500 &&
          error.getStatus() !== HttpStatus.REQUEST_TIMEOUT &&
          error.getStatus() !== HttpStatus.TOO_MANY_REQUESTS
        ) {
          throw new UnrecoverableError(`${error.name}: ${error.message}`)
        }
        throw error
      })
    if (!result) {
      this.logger.log(`RFQ dispatch ${job.id}: every BOM line has a contracted rate`)
      return null
    }
    if (result.notificationOutboxId) {
      await this.notificationQueue.enqueueOutbox(
        parsed.data.tenantId,
        result.notificationOutboxId
      )
    }
    return {
      rfqId: result.rfqId,
      tenantId: result.tenantId,
      projectId: result.projectId,
      lineCount: result.lineCount,
      created: result.created,
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<unknown, RfqCreationResult | null, string> | undefined,
    error: Error
  ): Promise<void> {
    if (!job?.id) return
    const attempts =
      typeof job.opts.attempts === 'number'
        ? job.opts.attempts
        : 1
    const unrecoverable =
      error instanceof UnrecoverableError || error.name === 'UnrecoverableError'
    if (job.attemptsMade < attempts && !unrecoverable) {
      return
    }

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
        // One per run: a re-dispatch re-adds the job with a new timestamp.
        jobId: `${job.id}-dead-letter-${job.timestamp}`,
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
