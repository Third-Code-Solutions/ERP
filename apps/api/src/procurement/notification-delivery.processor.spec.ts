import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import {
  NOTIFICATION_DELIVERY_JOB,
  NOTIFICATION_SWEEP_JOB,
} from './notification-delivery.constants'
import { NotificationDeliveryProcessor } from './notification-delivery.processor'
import type { NotificationDeliveryQueue } from './notification-delivery.queue'
import type { NotificationDeliveryService } from './notification-delivery.service'

const DATA = {
  schemaVersion: 1 as const,
  tenantId: '22222222-2222-4222-8222-222222222222',
  outboxId: '66666666-6666-4666-8666-666666666666',
  deliveryId: '77777777-7777-4777-8777-777777777777',
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: `notification1-${DATA.deliveryId}`,
    name: NOTIFICATION_DELIVERY_JOB,
    data: DATA,
    attemptsMade: 0,
    opts: { attempts: 5 },
    ...overrides,
  } as Job
}

function harness() {
  const deliver = vi.fn().mockResolvedValue({
    deliveryId: DATA.deliveryId,
    status: 'delivered',
  })
  const markDeadLetter = vi.fn().mockResolvedValue(undefined)
  const enqueuePending = vi.fn().mockResolvedValue(2)
  const processor = new NotificationDeliveryProcessor(
    {
      deliver,
      markDeadLetter,
    } as unknown as NotificationDeliveryService,
    { enqueuePending } as unknown as NotificationDeliveryQueue
  )
  return {
    processor,
    deliver,
    markDeadLetter,
    enqueuePending,
  }
}

describe('NotificationDeliveryProcessor', () => {
  it('validates opaque delivery and sweep jobs', async () => {
    const probe = harness()

    await expect(probe.processor.process(job())).resolves.toEqual({
      deliveryId: DATA.deliveryId,
      status: 'delivered',
    })
    expect(probe.deliver).toHaveBeenCalledWith(DATA)

    await expect(
      probe.processor.process(
        job({
          name: NOTIFICATION_SWEEP_JOB,
          data: { schemaVersion: 1 },
        })
      )
    ).resolves.toEqual({ enqueued: 2 })
    expect(probe.enqueuePending).toHaveBeenCalledOnce()
  })

  it('rejects business content in Redis payloads', async () => {
    const probe = harness()
    await expect(
      probe.processor.process(
        job({
          data: {
            ...DATA,
            recipientEmail: 'procurement@example.test',
          },
        })
      )
    ).rejects.toThrow('Invalid notification delivery job data')
    expect(probe.deliver).not.toHaveBeenCalled()
  })

  it('marks durable dead letter only after the final attempt', async () => {
    const probe = harness()
    const error = new Error('provider unavailable')

    await probe.processor.onFailed(
      job({ attemptsMade: 4 }),
      error
    )
    expect(probe.markDeadLetter).not.toHaveBeenCalled()

    await probe.processor.onFailed(
      job({ attemptsMade: 5 }),
      error
    )
    expect(probe.markDeadLetter).toHaveBeenCalledWith(DATA, error)
  })
})
