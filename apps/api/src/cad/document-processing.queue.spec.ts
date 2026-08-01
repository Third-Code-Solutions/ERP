import 'reflect-metadata'

import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { DocumentProcessingJobQueue } from './document-processing.queue'

const JOB_ID = '44444444-4444-4444-8444-444444444444'

describe('DocumentProcessingJobQueue', () => {
  it('publishes only the opaque job identity with retry policy', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({ id: 'transport-id' }),
    } as unknown as Queue
    const producer = new DocumentProcessingJobQueue(queue)

    await expect(producer.enqueue(JOB_ID)).resolves.toEqual({
      jobId: JOB_ID,
      enqueued: true,
    })
    expect(queue.add).toHaveBeenCalledWith(
      'process-document',
      { schemaVersion: 1, jobId: JOB_ID },
      expect.objectContaining({
        jobId: `document-processing1-${JOB_ID}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
      })
    )
  })

  it('deduplicates an existing transport job', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue({ id: 'existing' }),
      add: vi.fn(),
    } as unknown as Queue
    const producer = new DocumentProcessingJobQueue(queue)
    await expect(producer.enqueue(JOB_ID)).resolves.toEqual({
      jobId: JOB_ID,
      enqueued: false,
    })
    expect(queue.add).not.toHaveBeenCalled()
  })
})
