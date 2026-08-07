import 'reflect-metadata'

import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { CortexSemanticIndexJobQueue } from './cortex-semantic-index.queue'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('CortexSemanticIndexJobQueue', () => {
  it('publishes only opaque identity with a bounded retry policy', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({ id: 'transport' }),
    } as unknown as Queue
    const producer = new CortexSemanticIndexJobQueue(queue)
    await expect(producer.enqueue(JOB_ID)).resolves.toBe(true)
    expect(queue.add).toHaveBeenCalledWith(
      'index-cortex-nodes',
      { schemaVersion: 1, jobId: JOB_ID },
      expect.objectContaining({
        jobId: `cortex-semantic-index1-${JOB_ID}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      })
    )
  })

  it('deduplicates Redis transport and rejects unscoped recovery', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue({ id: 'existing' }),
      add: vi.fn(),
    } as unknown as Queue
    const state = { recoverableJobIds: vi.fn() }
    const producer = new CortexSemanticIndexJobQueue(queue, state as never)
    await expect(producer.enqueue(JOB_ID)).resolves.toBe(false)
    expect(queue.add).not.toHaveBeenCalled()
    await expect(producer.enqueuePending([])).rejects.toThrow(
      'recovery tenant scope is required'
    )
    expect(state.recoverableJobIds).not.toHaveBeenCalled()
  })

  it('intersects recovery, intake, and worker tenant scopes', () => {
    const config = {
      get: vi.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_ENABLED: true,
          ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED: true,
          ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED: true,
          ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_TENANT_IDS: [
            TENANT_ID,
            '33333333-3333-4333-8333-333333333333',
          ],
          ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS: [TENANT_ID],
          ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS: [TENANT_ID],
        }
        return values[key] ?? fallback
      }),
    }
    const producer = new CortexSemanticIndexJobQueue(
      {} as Queue,
      undefined,
      config as never
    )
    expect(producer.scopedRecoveryTenantIds()).toEqual([TENANT_ID])
  })
})
