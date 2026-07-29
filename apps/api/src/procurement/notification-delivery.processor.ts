import {
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq'
import { Inject, Logger } from '@nestjs/common'
import {
  notificationDeliveryJobSchema,
  notificationSweepJobSchema,
  type NotificationDeliveryResult,
} from '@third-code-erp/shared-types'
import type { Job } from 'bullmq'
import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_DELIVERY_QUEUE,
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
      return { enqueued: await this.queue.enqueuePending() }
    }
    if (job.name !== NOTIFICATION_DELIVERY_JOB) {
      throw new Error(`Unsupported notification job: ${job.name}`)
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
    if (!job || job.name !== NOTIFICATION_DELIVERY_JOB) return
    const attempts =
      typeof job.opts.attempts === 'number'
        ? job.opts.attempts
        : 1
    if (job.attemptsMade < attempts) return
    const parsed = notificationDeliveryJobSchema.safeParse(job.data)
    if (!parsed.success) return

    await this.deliveries.markDeadLetter(parsed.data, error)
    this.logger.error(
      `Notification delivery moved to dead letter: ${parsed.data.deliveryId}`
    )
  }
}
