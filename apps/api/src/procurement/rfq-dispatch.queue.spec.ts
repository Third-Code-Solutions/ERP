import type { Queue } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import {
  RFQ_DISPATCH_ATTEMPTS,
  RFQ_DISPATCH_BACKOFF_MS,
  RFQ_DISPATCH_JOB,
} from './rfq-dispatch.constants'
import { RfqDispatchQueue } from './rfq-dispatch.queue'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}
const BOM_ID = '88888888-8888-4888-8888-888888888888'
const JOB_ID =
  'rfq1-22222222-2222-4222-8222-222222222222-88888888-8888-4888-8888-888888888888'

function harness(existing: unknown = undefined) {
  const getJob = vi.fn().mockResolvedValue(existing)
  const add = vi.fn().mockResolvedValue({ id: JOB_ID })
  const queue = { getJob, add } as unknown as Queue
  return {
    queue: new RfqDispatchQueue(queue),
    getJob,
    add,
  }
}

describe('RfqDispatchQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('derives strict authority, deterministic id, and bounded retries', async () => {
    const probe = harness()

    await expect(
      probe.queue.enqueue({ bomId: BOM_ID }, PRINCIPAL)
    ).resolves.toEqual({
      jobId: JOB_ID,
      enqueued: true,
    })
    expect(probe.add).toHaveBeenCalledWith(
      RFQ_DISPATCH_JOB,
      {
        schemaVersion: 1,
        tenantId: PRINCIPAL.tenantId,
        actorId: PRINCIPAL.userId,
        bomId: BOM_ID,
        source: 'bom_approved',
      },
      {
        jobId: JOB_ID,
        attempts: RFQ_DISPATCH_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: RFQ_DISPATCH_BACKOFF_MS,
        },
        removeOnComplete: 1_000,
        removeOnFail: false,
      }
    )
  })

  it('deduplicates an existing tenant/BOM job', async () => {
    const probe = harness({
      id: JOB_ID,
      returnvalue: null,
      isFailed: vi.fn().mockResolvedValue(false),
      isCompleted: vi.fn().mockResolvedValue(false),
    })

    await expect(
      probe.queue.enqueue({ bomId: BOM_ID }, PRINCIPAL)
    ).resolves.toEqual({
      jobId: JOB_ID,
      enqueued: false,
    })
    expect(probe.add).not.toHaveBeenCalled()
  })

  it('replaces a failed dispatch so a later request can still create the RFQ', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const probe = harness({ id: JOB_ID, isFailed: vi.fn().mockResolvedValue(true), remove })

    await expect(
      probe.queue.enqueue({ bomId: BOM_ID }, PRINCIPAL)
    ).resolves.toEqual({
      jobId: JOB_ID,
      enqueued: true,
    })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
      probe.add.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('replaces a finished dispatch that found every line contracted', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const probe = harness({
      id: JOB_ID,
      returnvalue: null,
      isFailed: vi.fn().mockResolvedValue(false),
      isCompleted: vi.fn().mockResolvedValue(true),
      remove,
    })

    await expect(
      probe.queue.enqueue({ bomId: BOM_ID }, PRINCIPAL)
    ).resolves.toEqual({ jobId: JOB_ID, enqueued: true })
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('deduplicates a finished dispatch that created an RFQ', async () => {
    const probe = harness({
      id: JOB_ID,
      returnvalue: { rfqId: 'rfq', created: true },
      isFailed: vi.fn().mockResolvedValue(false),
      isCompleted: vi.fn().mockResolvedValue(true),
    })

    await expect(
      probe.queue.enqueue({ bomId: BOM_ID }, PRINCIPAL)
    ).resolves.toEqual({ jobId: JOB_ID, enqueued: false })
    expect(probe.add).not.toHaveBeenCalled()
  })

  it('deduplicates a dispatch that finished after it was first fetched', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const probe = harness()
    // The first fetch predates completion (returnvalue is null until done);
    // the job has created an RFQ by the time completion is confirmed.
    probe.getJob
      .mockResolvedValueOnce({
        id: JOB_ID,
        returnvalue: null,
        isFailed: vi.fn().mockResolvedValue(false),
        isCompleted: vi.fn().mockResolvedValue(true),
        remove,
      })
      .mockResolvedValueOnce({
        id: JOB_ID,
        returnvalue: { rfqId: 'rfq', created: true },
      })

    await expect(
      probe.queue.enqueue({ bomId: BOM_ID }, PRINCIPAL)
    ).resolves.toEqual({ jobId: JOB_ID, enqueued: false })
    expect(remove).not.toHaveBeenCalled()
    expect(probe.add).not.toHaveBeenCalled()
  })

  it('deduplicates when a concurrent request already replaced the failed job', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('locked by another worker'))
    const probe = harness({ id: JOB_ID, isFailed: vi.fn().mockResolvedValue(true), remove })

    await expect(
      probe.queue.enqueue({ bomId: BOM_ID }, PRINCIPAL)
    ).resolves.toEqual({
      jobId: JOB_ID,
      enqueued: false,
    })
    expect(probe.add).not.toHaveBeenCalled()
  })
})
