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
    const probe = harness({ id: JOB_ID })

    await expect(
      probe.queue.enqueue({ bomId: BOM_ID }, PRINCIPAL)
    ).resolves.toEqual({
      jobId: JOB_ID,
      enqueued: false,
    })
    expect(probe.add).not.toHaveBeenCalled()
  })
})
