import { InjectQueue } from '@nestjs/bullmq'
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  NotificationDeliveryJob,
  NotificationDeliveryResult,
  NotificationSweepJob,
  PurchaseOrderSupplierEmailDeliveryJob,
} from '@third-code-erp/shared-types'
import type { Queue } from 'bullmq'
import {
  NOTIFICATION_DELIVERY_ATTEMPTS,
  NOTIFICATION_DELIVERY_BACKOFF_MS,
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_DELIVERY_QUEUE,
  NOTIFICATION_SUPPLIER_DELIVERY_JOB,
  NOTIFICATION_SWEEP_INTERVAL_MS,
  NOTIFICATION_SWEEP_JOB,
  NOTIFICATION_SWEEP_SCHEDULER,
  notificationDeliveryJobId,
  supplierNotificationDeliveryJobId,
} from './notification-delivery.constants'
import { NotificationDeliveryService } from './notification-delivery.service'

type NotificationJobData =
  | NotificationDeliveryJob
  | PurchaseOrderSupplierEmailDeliveryJob
  | NotificationSweepJob

@Injectable()
export class NotificationDeliveryQueue
  implements OnApplicationBootstrap
{
  constructor(
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE)
    private readonly queue: Queue<
      NotificationJobData,
      NotificationDeliveryResult | { enqueued: number },
      string
    >,
    @Inject(NotificationDeliveryService)
    private readonly deliveries: NotificationDeliveryService,
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (
      this.config.get<boolean>(
        'ERP_NOTIFICATION_SWEEP_ENABLED',
        false
      ) !== true
    ) {
      return
    }
    await this.queue.upsertJobScheduler(
      NOTIFICATION_SWEEP_SCHEDULER,
      { every: NOTIFICATION_SWEEP_INTERVAL_MS },
      {
        name: NOTIFICATION_SWEEP_JOB,
        data: { schemaVersion: 1 },
        opts: {
          attempts: 1,
          removeOnComplete: 100,
          removeOnFail: 1_000,
        },
      }
    )
  }

  async enqueueOutbox(
    tenantId: string,
    outboxId: string
  ): Promise<number> {
    const pending = await this.deliveries.pendingForOutbox(
      tenantId,
      outboxId
    )
    return this.enqueue(pending)
  }

  async enqueuePending(): Promise<number> {
    return this.enqueue(await this.deliveries.pending())
  }

  async enqueueSupplierOutbox(
    tenantId: string,
    outboxId: string
  ): Promise<number> {
    return this.enqueueSupplier(
      await this.deliveries.pendingSupplierForOutbox(tenantId, outboxId)
    )
  }

  async enqueuePendingSupplier(): Promise<number> {
    return this.enqueueSupplier(await this.deliveries.pendingSupplier())
  }

  private async enqueue(
    pending: Array<{
      deliveryId: string
      outboxId: string
      tenantId: string
    }>
  ): Promise<number> {
    let enqueued = 0
    for (const delivery of pending) {
      const jobId = notificationDeliveryJobId(
        delivery.deliveryId
      )
      if (await this.queue.getJob(jobId)) continue
      await this.queue.add(
        NOTIFICATION_DELIVERY_JOB,
        {
          schemaVersion: 1,
          tenantId: delivery.tenantId,
          outboxId: delivery.outboxId,
          deliveryId: delivery.deliveryId,
        },
        {
          jobId,
          attempts: NOTIFICATION_DELIVERY_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: NOTIFICATION_DELIVERY_BACKOFF_MS,
          },
          removeOnComplete: 1_000,
          removeOnFail: false,
        }
      )
      enqueued += 1
    }
    return enqueued
  }

  private async enqueueSupplier(
    pending: Array<{
      deliveryId: string
      outboxId: string
      tenantId: string
    }>
  ): Promise<number> {
    let enqueued = 0
    for (const delivery of pending) {
      const jobId = supplierNotificationDeliveryJobId(
        delivery.deliveryId
      )
      if (await this.queue.getJob(jobId)) continue
      await this.queue.add(
        NOTIFICATION_SUPPLIER_DELIVERY_JOB,
        {
          schemaVersion: 1,
          tenantId: delivery.tenantId,
          outboxId: delivery.outboxId,
          deliveryId: delivery.deliveryId,
        },
        {
          jobId,
          attempts: NOTIFICATION_DELIVERY_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: NOTIFICATION_DELIVERY_BACKOFF_MS,
          },
          removeOnComplete: 1_000,
          removeOnFail: false,
        }
      )
      enqueued += 1
    }
    return enqueued
  }
}
