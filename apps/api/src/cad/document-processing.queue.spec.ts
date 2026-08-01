import 'reflect-metadata'

import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { DocumentProcessingJobQueue } from './document-processing.queue'

const JOB_ID = '44444444-4444-4444-8444-444444444444'
const TENANT_ID = '55555555-5555-4555-8555-555555555555'

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

  it('rebuilds missing transport jobs from PostgreSQL-owned IDs', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({ id: 'transport-id' }),
    } as unknown as Queue
    const state = {
      recoverableJobIds: vi.fn().mockResolvedValue([JOB_ID]),
    }
    const producer = new DocumentProcessingJobQueue(queue, state as never)

    await expect(producer.enqueuePending([TENANT_ID])).resolves.toBe(1)
    expect(state.recoverableJobIds).toHaveBeenCalledWith(
      expect.any(Date),
      [TENANT_ID]
    )
    expect(queue.add).toHaveBeenCalledOnce()
  })

  it('does not create a recovery scheduler when the gate is closed', async () => {
    const queue = {
      upsertJobScheduler: vi.fn(),
    } as unknown as Queue
    const config = {
      get: vi.fn((_: string, fallback?: unknown) => fallback),
    }
    const producer = new DocumentProcessingJobQueue(
      queue,
      undefined,
      config as never
    )

    await producer.onApplicationBootstrap()

    expect(queue.upsertJobScheduler).not.toHaveBeenCalled()
  })

  it('schedules recovery only for explicitly scoped tenants', async () => {
    const queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue
    const config = {
      get: vi.fn((key: string, fallback?: unknown) => {
        if (key === 'ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED') return true
        if (key === 'ERP_DOCUMENT_PROCESSING_JOBS_ENABLED') return true
        if (key === 'ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED') return true
        if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED') return true
        if (key === 'ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS') {
          return [TENANT_ID]
        }
        if (key === 'ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS') {
          return [TENANT_ID]
        }
        if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS') {
          return [TENANT_ID]
        }
        return fallback
      }),
    }
    const producer = new DocumentProcessingJobQueue(
      queue,
      undefined,
      config as never
    )

    await producer.onApplicationBootstrap()

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'document-processing-recovery-v1',
      { every: 60_000 },
      expect.objectContaining({
        name: 'recover-document-processing',
        data: { schemaVersion: 1 },
      })
    )
  })

  it('rejects unscoped recovery calls', async () => {
    const queue = {
      getJob: vi.fn(),
      add: vi.fn(),
    } as unknown as Queue
    const state = {
      recoverableJobIds: vi.fn(),
    }
    const producer = new DocumentProcessingJobQueue(queue, state as never)

    await expect(producer.enqueuePending([])).rejects.toThrow(
      'tenant scope is required'
    )
    expect(state.recoverableJobIds).not.toHaveBeenCalled()
  })
})
