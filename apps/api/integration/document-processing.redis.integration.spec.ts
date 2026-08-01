import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { Queue, Worker, type QueueOptions, type WorkerOptions } from 'bullmq'
import {
  documentProcessingQueueJobSchema,
  type DocumentProcessingQueueJob,
} from '@third-code-erp/shared-types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { redisConnectionOptions } from '../src/config/environment'
import { DocumentProcessingJobQueue } from '../src/cad/document-processing.queue'
import {
  DOCUMENT_PROCESSING_JOB,
  DOCUMENT_PROCESSING_QUEUE,
  documentProcessingJobId,
} from '../src/cad/document-processing.constants'
import { DocumentProcessingProcessor } from '../src/cad/document-processing.processor'

const integrationEnabled =
  Boolean(process.env.REDIS_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip

const queues: Queue[] = []
const workers: Worker[] = []

function connection(): QueueOptions['connection'] &
  WorkerOptions['connection'] {
  return redisConnectionOptions(process.env.REDIS_URL!)
}

function queueName(): string {
  return `${DOCUMENT_PROCESSING_QUEUE}-test-${randomUUID()}`
}

async function waitForCompleted(
  queue: Queue,
  jobId: string,
  timeoutMs = 15_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId)
    if (job && (await job.getState()) === 'completed') return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Job ${jobId} did not complete`)
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

suite('document processing BullMQ disposable Redis integration', () => {
  it('publishes one opaque job and deduplicates duplicate delivery', async () => {
    const queue = new Queue<DocumentProcessingQueueJob, void, string>(
      queueName(),
      { connection: connection() }
    )
    queues.push(queue)

    const processed: DocumentProcessingQueueJob[] = []
    const worker = new Worker<DocumentProcessingQueueJob, void, string>(
      queue.name,
      async (job) => {
        const parsed = documentProcessingQueueJobSchema.parse(job.data)
        processed.push(parsed)
      },
      { connection: connection() }
    )
    workers.push(worker)

    const producer = new DocumentProcessingJobQueue(queue)
    const jobId = randomUUID()
    const first = await producer.enqueue(jobId)
    const second = await producer.enqueue(jobId)

    await waitForCompleted(queue, documentProcessingJobId(jobId))

    expect(first).toEqual({ jobId, enqueued: true })
    expect(second).toEqual({ jobId, enqueued: false })
    expect(processed).toEqual([{ schemaVersion: 1, jobId }])
  }, 20_000)

  it('bounds retry attempts and reports final failure to PostgreSQL state', async () => {
    const queue = new Queue<DocumentProcessingQueueJob, void, string>(
      queueName(),
      { connection: connection() }
    )
    queues.push(queue)

    const fail = vi.fn().mockResolvedValue(true)
    const processor = new DocumentProcessingProcessor(
      {} as never,
      { fail } as never,
      {} as never,
      {} as never,
      {} as never
    )
    const worker = new Worker<DocumentProcessingQueueJob, void, string>(
      queue.name,
      async () => {
        throw new Error('worker unavailable')
      },
      { connection: connection() }
    )
    worker.on('failed', (job, error) => {
      void processor.onFailed(job, error)
    })
    workers.push(worker)

    const jobId = randomUUID()
    const transportId = documentProcessingJobId(jobId)
    await queue.add(
      DOCUMENT_PROCESSING_JOB,
      { schemaVersion: 1, jobId },
      {
        jobId: transportId,
        attempts: 3,
        backoff: { type: 'fixed', delay: 50 },
        removeOnFail: false,
      }
    )
    await waitForState(queue, transportId, 'failed')

    const deadline = Date.now() + 5_000
    while (fail.mock.calls.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(fail).toHaveBeenCalledOnce()
    expect(fail).toHaveBeenCalledWith(jobId, 'processing_failed')
  }, 20_000)

  it('re-enqueues a job after Redis transport data is lost', async () => {
    const queue = new Queue<DocumentProcessingQueueJob, void, string>(
      queueName(),
      { connection: connection() }
    )
    queues.push(queue)

    const processed: string[] = []
    const worker = new Worker<DocumentProcessingQueueJob, void, string>(
      queue.name,
      async (job) => {
        processed.push(job.data.jobId)
      },
      { connection: connection() }
    )
    workers.push(worker)

    const jobId = randomUUID()
    const state = {
      recoverableJobIds: vi.fn().mockResolvedValue([jobId]),
    }
    const producer = new DocumentProcessingJobQueue(queue, state as never)

    await expect(producer.enqueuePending()).resolves.toBe(1)
    await waitForCompleted(queue, documentProcessingJobId(jobId))
    await queue.obliterate({ force: true })

    await expect(producer.enqueuePending()).resolves.toBe(1)
    await waitForCompleted(queue, documentProcessingJobId(jobId))
    expect(processed).toEqual([jobId, jobId])
    expect(state.recoverableJobIds).toHaveBeenCalledTimes(2)
  }, 20_000)
})
