import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  Queue,
  Worker,
  type Job,
  type QueueOptions,
  type WorkerOptions,
} from 'bullmq'
import type { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type NotificationDeliveryJob,
  type NotificationDeliveryResult,
  type RfqCreationResult,
  type RfqDispatchDeadLetter,
  type RfqDispatchJob,
} from '@third-code-erp/shared-types'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { redisConnectionOptions } from '../src/config/environment'
import {
  NOTIFICATION_DELIVERY_JOB,
  notificationDeliveryJobId,
} from '../src/procurement/notification-delivery.constants'
import { NotificationDeliveryProcessor } from '../src/procurement/notification-delivery.processor'
import { NotificationDeliveryQueue } from '../src/procurement/notification-delivery.queue'
import type { NotificationDeliveryService } from '../src/procurement/notification-delivery.service'
import {
  RFQ_DISPATCH_DEAD_LETTER_JOB,
  RFQ_DISPATCH_JOB,
} from '../src/procurement/rfq-dispatch.constants'
import { RfqDispatchProcessor } from '../src/procurement/rfq-dispatch.processor'
import { RfqDispatchQueue } from '../src/procurement/rfq-dispatch.queue'
import type { ProcurementService } from '../src/procurement/procurement.service'

const integrationEnabled =
  Boolean(process.env.REDIS_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const redisRestartEnabled =
  integrationEnabled &&
  process.env.ERP_REDIS_RESTART_EXPECTED === '1' &&
  Boolean(process.env.ERP_REDIS_RESTART_CONTAINER)
function restartTest(
  name: string,
  fn: () => Promise<void>,
  timeout?: number
): void {
  if (redisRestartEnabled) {
    it(name, fn, timeout)
  } else {
    it.skip(name, fn, timeout)
  }
}
const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}
const BOM_ID = '88888888-8888-4888-8888-888888888888'
const RESULT: RfqCreationResult = {
  rfqId: '33333333-3333-4333-8333-333333333333',
  tenantId: PRINCIPAL.tenantId,
  projectId: '99999999-9999-4999-8999-999999999999',
  lineCount: 1,
  created: true,
}
const NOTIFICATION_DELIVERY = {
  deliveryId: '77777777-7777-4777-8777-777777777777',
  outboxId: '66666666-6666-4666-8666-666666666666',
  tenantId: PRINCIPAL.tenantId,
}

const queues: Queue[] = []
const workers: Worker[] = []

function connection(): QueueOptions['connection'] &
  WorkerOptions['connection'] {
  return redisConnectionOptions(process.env.REDIS_URL!)
}

function queueName(label: string): string {
  return `third-code-erp-test-${label}-${randomUUID()}`
}

async function waitForState(
  queue: Queue,
  jobId: string,
  expected: 'completed' | 'failed',
  timeoutMs = 15_000
): Promise<Job> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId)
    if (job && (await job.getState()) === expected) return job
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Job ${jobId} did not reach ${expected}`)
}

async function waitForJob(
  queue: Queue,
  jobId: string,
  timeoutMs = 10_000
): Promise<Job> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId)
    if (job) return job
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Job ${jobId} was not found`)
}

async function waitForRedis(queue: Queue): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      await queue.getJobCounts()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw new Error('BullMQ did not reconnect after Redis restart')
}

function restartDisposableRedis(options?: { discardData?: boolean }): void {
  if (process.env.ERP_REDIS_RESTART_EXPECTED !== '1') {
    throw new Error('Disposable Redis restart was not enabled')
  }
  const container = process.env.ERP_REDIS_RESTART_CONTAINER
  if (!container) {
    throw new Error('Disposable Redis container is missing')
  }
  execFileSync('docker', ['restart', container], { stdio: 'pipe' })
  if (options?.discardData) {
    execFileSync('docker', ['exec', container, 'redis-cli', 'flushall'], {
      stdio: 'pipe',
    })
  }
}

afterEach(async () => {
  await Promise.allSettled(
    workers.splice(0).map((worker) => worker.close(true))
  )
  await Promise.allSettled(
    queues.splice(0).map(async (queue) => {
      await queue.obliterate({ force: true }).catch(() => undefined)
      await queue.close()
    })
  )
})

suite('RFQ BullMQ disposable Redis integration', () => {
  it('deduplicates tenant/BOM delivery and processes one job', async () => {
    const name = queueName('dedupe')
    const queue = new Queue<RfqDispatchJob, RfqCreationResult, string>(
      name,
      { connection: connection() }
    )
    queues.push(queue)
    const createFromApprovedBom = vi.fn().mockResolvedValue(RESULT)
    const worker = new Worker<RfqDispatchJob, RfqCreationResult, string>(
      name,
      async (job) =>
        createFromApprovedBom(job.data),
      { connection: connection() }
    )
    workers.push(worker)
    const producer = new RfqDispatchQueue(queue)

    const first = await producer.enqueue(
      { bomId: BOM_ID },
      PRINCIPAL
    )
    const second = await producer.enqueue(
      { bomId: BOM_ID },
      PRINCIPAL
    )
    await waitForState(queue, first.jobId, 'completed')

    expect(first.enqueued).toBe(true)
    expect(second).toEqual({
      jobId: first.jobId,
      enqueued: false,
    })
    expect(createFromApprovedBom).toHaveBeenCalledOnce()
  }, 20_000)

  it('bounds retries and writes one explicit dead letter', async () => {
    const name = queueName('retry')
    const deadLetterName = queueName('dead-letter')
    const queue = new Queue<RfqDispatchJob, RfqCreationResult, string>(
      name,
      { connection: connection() }
    )
    const deadLetterQueue = new Queue<
      RfqDispatchDeadLetter,
      void,
      string
    >(deadLetterName, { connection: connection() })
    queues.push(queue, deadLetterQueue)
    const createFromApprovedBom = vi
      .fn()
      .mockRejectedValue(new Error('database unavailable'))
    const processor = new RfqDispatchProcessor(
      { createFromApprovedBom } as unknown as ProcurementService,
      deadLetterQueue,
      {
        enqueueOutbox: vi.fn(),
      } as unknown as NotificationDeliveryQueue
    )
    const worker = new Worker<RfqDispatchJob, RfqCreationResult, string>(
      name,
      async (job) => processor.process(job),
      { connection: connection() }
    )
    worker.on('failed', (job, error) => {
      void processor.onFailed(job, error)
    })
    workers.push(worker)

    const jobId = `retry-${randomUUID()}`
    await queue.add(RFQ_DISPATCH_JOB, {
      schemaVersion: 1,
      tenantId: PRINCIPAL.tenantId,
      actorId: PRINCIPAL.userId,
      bomId: BOM_ID,
      source: 'bom_approved',
    }, {
      jobId,
      attempts: 3,
      backoff: { type: 'fixed', delay: 50 },
      removeOnFail: false,
    })
    await waitForState(queue, jobId, 'failed')

    const deadLetterId = `${jobId}-dead-letter`
    const deadLetter = await waitForJob(
      deadLetterQueue,
      deadLetterId
    )
    expect(createFromApprovedBom).toHaveBeenCalledTimes(3)
    expect(deadLetter.name).toBe(RFQ_DISPATCH_DEAD_LETTER_JOB)
    expect(deadLetter.data).toMatchObject({
      schemaVersion: 1,
      sourceJobId: jobId,
      attemptsMade: 3,
      errorMessage: 'database unavailable',
    })
  }, 20_000)

  restartTest('reconnects and processes after disposable Redis restarts', async () => {
    const name = queueName('restart')
    const queue = new Queue<RfqDispatchJob, RfqCreationResult, string>(
      name,
      { connection: connection() }
    )
    queues.push(queue)
    const worker = new Worker<RfqDispatchJob, RfqCreationResult, string>(
      name,
      async () => RESULT,
      { connection: connection() }
    )
    workers.push(worker)

    const firstId = `before-${randomUUID()}`
    await queue.add(RFQ_DISPATCH_JOB, {
      schemaVersion: 1,
      tenantId: PRINCIPAL.tenantId,
      actorId: PRINCIPAL.userId,
      bomId: BOM_ID,
      source: 'bom_approved',
    }, { jobId: firstId })
    await waitForState(queue, firstId, 'completed')

    restartDisposableRedis()
    await waitForRedis(queue)

    const secondId = `after-${randomUUID()}`
    await queue.add(RFQ_DISPATCH_JOB, {
      schemaVersion: 1,
      tenantId: PRINCIPAL.tenantId,
      actorId: PRINCIPAL.userId,
      bomId: BOM_ID,
      source: 'bom_approved',
    }, { jobId: secondId })
    await waitForState(queue, secondId, 'completed', 20_000)
  }, 30_000)

  it('bounds notification retries and persists final dead-letter intent', async () => {
    const name = queueName('notification-retry')
    const queue = new Queue<
      NotificationDeliveryJob,
      NotificationDeliveryResult,
      string
    >(name, { connection: connection() })
    queues.push(queue)
    const deliver = vi
      .fn()
      .mockRejectedValue(new Error('email provider unavailable'))
    const markDeadLetter = vi.fn().mockResolvedValue(undefined)
    const processor = new NotificationDeliveryProcessor({
      deliver,
      markDeadLetter,
    } as unknown as NotificationDeliveryService)
    const worker = new Worker<
      NotificationDeliveryJob,
      NotificationDeliveryResult,
      string
    >(name, async (job) => processor.process(job), {
      connection: connection(),
    })
    worker.on('failed', (job, error) => {
      void processor.onFailed(job, error)
    })
    workers.push(worker)

    const jobId = `notification-retry-${randomUUID()}`
    const data: NotificationDeliveryJob = {
      schemaVersion: 1,
      ...NOTIFICATION_DELIVERY,
    }
    await queue.add(NOTIFICATION_DELIVERY_JOB, data, {
      jobId,
      attempts: 3,
      backoff: { type: 'fixed', delay: 50 },
      removeOnFail: false,
    })
    await waitForState(queue, jobId, 'failed')
    const deadline = Date.now() + 5_000
    while (
      markDeadLetter.mock.calls.length === 0 &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }

    expect(deliver).toHaveBeenCalledTimes(3)
    expect(markDeadLetter).toHaveBeenCalledOnce()
    expect(markDeadLetter).toHaveBeenCalledWith(
      data,
      expect.objectContaining({
        message: 'email provider unavailable',
      })
    )
  }, 20_000)

  restartTest('recovers a database-pending notification after Redis data loss', async () => {
    const name = queueName('notification-recovery')
    const queue = new Queue<
      NotificationDeliveryJob,
      NotificationDeliveryResult,
      string
    >(name, { connection: connection() })
    queues.push(queue)
    const deliver = vi.fn().mockImplementation(
      async (
        job: NotificationDeliveryJob
      ): Promise<NotificationDeliveryResult> => ({
        deliveryId: job.deliveryId,
        status: 'delivered',
      })
    )
    const worker = new Worker<
      NotificationDeliveryJob,
      NotificationDeliveryResult,
      string
    >(name, async (job) => deliver(job.data), {
      connection: connection(),
    })
    workers.push(worker)

    const pending = vi
      .fn()
      .mockResolvedValue([NOTIFICATION_DELIVERY])
    const producer = new NotificationDeliveryQueue(
      queue,
      {
        pending,
        pendingForOutbox: vi.fn(),
      } as unknown as NotificationDeliveryService,
      {
        get: vi.fn().mockReturnValue(false),
      } as unknown as ConfigService
    )

    const beforeId = `before-loss-${randomUUID()}`
    await queue.add(
      NOTIFICATION_DELIVERY_JOB,
      {
        schemaVersion: 1,
        ...NOTIFICATION_DELIVERY,
      },
      { jobId: beforeId }
    )
    await waitForState(queue, beforeId, 'completed')

    restartDisposableRedis({ discardData: true })
    await waitForRedis(queue)

    await expect(producer.enqueuePending()).resolves.toBe(1)
    await waitForState(
      queue,
      notificationDeliveryJobId(
        NOTIFICATION_DELIVERY.deliveryId
      ),
      'completed',
      20_000
    )
    expect(pending).toHaveBeenCalledOnce()
    expect(deliver).toHaveBeenCalledTimes(2)
  }, 30_000)
})
