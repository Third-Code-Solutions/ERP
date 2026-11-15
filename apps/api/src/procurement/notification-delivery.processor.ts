import {
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import {
  notificationDeliveryJobSchema,
  notificationSweepJobSchema,
  purchaseOrderSupplierEmailDeliveryJobSchema,
  type NotificationDeliveryResult,
} from '@third-code-erp/shared-types'
import { UnrecoverableError, type Job } from 'bullmq'
import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATION_SUPPLIER_DELIVERY_JOB,
  NOTIFICATION_SWEEP_JOB,
} from './notification-delivery.constants'
import { NotificationDeliveryQueue } from './notification-delivery.queue'
import { NotificationDeliveryService } from './notification-delivery.service'

@Processor(NOTIFICATION_DELIVERY_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(
    NotificationDeliveryProcessor.name
  )

  constructor(
    @Inject(NotificationDeliveryService)
    private readonly deliveries: NotificationDeliveryService,
    @Inject(NotificationDeliveryQueue)
    private readonly queue: NotificationDeliveryQueue
  ) {
    super()
  }

  async process(
    job: Job<unknown, unknown, string>
  ): Promise<NotificationDeliveryResult | { enqueued: number }> {
    if (job.name === NOTIFICATION_SWEEP_JOB) {
      const parsed = notificationSweepJobSchema.safeParse(job.data)
      if (!parsed.success) {
        throw new Error('Invalid notification sweep job data')
      }
      const enqueued =
        (await this.queue.enqueuePending()) +
        (await this.queue.enqueuePendingSupplier())
      return { enqueued }
    }
    if (job.name !== NOTIFICATION_DELIVERY_JOB) {
      if (job.name !== NOTIFICATION_SUPPLIER_DELIVERY_JOB) {
        throw new Error(`Unsupported notification job: ${job.name}`)
      }
      const parsed = purchaseOrderSupplierEmailDeliveryJobSchema.safeParse(
        job.data
      )
      if (!parsed.success) {
        throw new Error('Invalid supplier email delivery job data')
      }
      return this.deliveries.deliverSupplierEmail(parsed.data)
    }
    const parsed = notificationDeliveryJobSchema.safeParse(job.data)
    if (!parsed.success) {
      throw new Error('Invalid notification delivery job data')
    }
    return this.deliveries.deliver(parsed.data)
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<unknown, unknown, string> | undefined,
    error: Error
  ): Promise<void> {
    if (
      !job ||
      (job.name !== NOTIFICATION_DELIVERY_JOB &&
        job.name !== NOTIFICATION_SUPPLIER_DELIVERY_JOB)
    )
      return
    const attempts =
      typeof job.opts.attempts === 'number'
        ? job.opts.attempts
        : 1
    // BullMQ skips the remaining attempts of an UnrecoverableError.
    const unrecoverable =
      error instanceof UnrecoverableError || error.name === 'UnrecoverableError'
    if (job.attemptsMade < attempts && !unrecoverable) {
      // The claim clears last_error and a replaced job loses its failedReason.
      this.logger.warn(
        `Notification delivery job ${job.id} attempt ${job.attemptsMade} failed: ${error.message}`
      )
      return
    }
    // Nest binds this handler without a catch: a throw would be an unhandled
    // rejection. The row stays undelivered, so the next sweep runs it again.
    await this.deadLetter(job, error).catch((failure: unknown) => {
      this.logger.error(
        `Notification delivery job ${job.id} could not be dead-lettered: ${
          failure instanceof Error ? failure.message : String(failure)
        }`
      )
    })
  }

  private async deadLetter(
    job: Job<unknown, unknown, string>,
    error: Error
  ): Promise<void> {
    if (job.name === NOTIFICATION_SUPPLIER_DELIVERY_JOB) {
      const parsed = purchaseOrderSupplierEmailDeliveryJobSchema.safeParse(
        job.data
      )
      if (!parsed.success) return
      await this.deliveries.markSupplierDeadLetter(parsed.data, error)
      this.logger.error(
        `Supplier email delivery moved to dead letter: ${parsed.data.deliveryId}`
      )
      return
    }
    const parsed = notificationDeliveryJobSchema.safeParse(job.data)
    if (!parsed.success) return

    await this.deliveries.markDeadLetter(parsed.data, error)
    this.logger.error(
      `Notification delivery moved to dead letter: ${parsed.data.deliveryId}`
    )
  }
}
