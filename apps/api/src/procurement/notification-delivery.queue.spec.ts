import type { Queue } from 'bullmq'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import {
  NOTIFICATION_DELIVERY_ATTEMPTS,
  NOTIFICATION_DELIVERY_BACKOFF_MS,
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_SWEEP_INTERVAL_MS,
  NOTIFICATION_SWEEP_JOB,
  NOTIFICATION_SWEEP_SCHEDULER,
} from './notification-delivery.constants'
import { NotificationDeliveryQueue } from './notification-delivery.queue'
import type { NotificationDeliveryService } from './notification-delivery.service'

const DELIVERY = {
  deliveryId: '77777777-7777-4777-8777-777777777777',
  outboxId: '66666666-6666-4666-8666-666666666666',
  tenantId: '22222222-2222-4222-8222-222222222222',
}

function harness(
  existing: unknown = null,
  sweepEnabled = false
) {
  const upsertJobScheduler = vi.fn().mockResolvedValue({})
  const getJob = vi.fn().mockResolvedValue(existing)
  const add = vi.fn().mockResolvedValue({
    id: `notification1-${DELIVERY.deliveryId}`,
  })
  const pendingForOutbox = vi
    .fn()
    .mockResolvedValue([DELIVERY])
  const pending = vi.fn().mockResolvedValue([DELIVERY])
  const queue = new NotificationDeliveryQueue(
    {
      upsertJobScheduler,
      getJob,
      add,
    } as unknown as Queue,
    {
      pendingForOutbox,
      pending,
    } as unknown as NotificationDeliveryService,
    {
      get: vi.fn().mockReturnValue(sweepEnabled),
    } as unknown as ConfigService
  )
  return {
    queue,
    upsertJobScheduler,
    getJob,
    add,
    pendingForOutbox,
  }
}

describe('NotificationDeliveryQueue', () => {
  it('does not schedule recovery polling by default', async () => {
    const probe = harness()
    await probe.queue.onApplicationBootstrap()

    expect(probe.upsertJobScheduler).not.toHaveBeenCalled()
  })

  it('upserts one stable one-minute recovery sweep when enabled', async () => {
    const probe = harness(null, true)
    await probe.queue.onApplicationBootstrap()

    expect(probe.upsertJobScheduler).toHaveBeenCalledWith(
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
  })

  it('enqueues opaque deterministic delivery jobs with fixed retry', async () => {
    const probe = harness()

    await expect(
      probe.queue.enqueueOutbox(
        DELIVERY.tenantId,
        DELIVERY.outboxId
      )
    ).resolves.toBe(1)
    expect(probe.pendingForOutbox).toHaveBeenCalledWith(
      DELIVERY.tenantId,
      DELIVERY.outboxId
    )
    expect(probe.add).toHaveBeenCalledWith(
      NOTIFICATION_DELIVERY_JOB,
      {
        schemaVersion: 1,
        tenantId: DELIVERY.tenantId,
        outboxId: DELIVERY.outboxId,
        deliveryId: DELIVERY.deliveryId,
      },
      {
        jobId: `notification1-${DELIVERY.deliveryId}`,
        attempts: NOTIFICATION_DELIVERY_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: NOTIFICATION_DELIVERY_BACKOFF_MS,
        },
        removeOnComplete: 1_000,
        removeOnFail: false,
      }
    )
  })

  it('does not add a duplicate job while deterministic state exists', async () => {
    const probe = harness({ id: 'existing' })
    await expect(probe.queue.enqueuePending()).resolves.toBe(0)
    expect(probe.add).not.toHaveBeenCalled()
  })
})
