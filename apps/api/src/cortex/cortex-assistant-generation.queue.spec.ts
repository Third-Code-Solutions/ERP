import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { CortexAssistantGenerationJobQueue } from './cortex-assistant-generation.queue'
import type { CortexAssistantGenerationStateService } from './cortex-assistant-generation.state'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

function config(values: Record<string, unknown> = {}): ConfigService {
  return {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService
}

describe('CortexAssistantGenerationJobQueue', () => {
  it('publishes opaque identity only with bounded retries', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({ id: 'transport' }),
    } as unknown as Queue
    const producer = new CortexAssistantGenerationJobQueue(
      queue,
      {} as CortexAssistantGenerationStateService,
      config()
    )
    await expect(producer.enqueue(JOB_ID)).resolves.toBe(true)
    expect(queue.add).toHaveBeenCalledWith(
      'generate-grounded-answer',
      { schemaVersion: 1, jobId: JOB_ID },
      expect.objectContaining({
        jobId: `cortex-assistant-generation1-${JOB_ID}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
      })
    )
  })

  it('intersects recovery, intake, and worker tenant scopes', () => {
    const producer = new CortexAssistantGenerationJobQueue(
      {} as Queue,
      {} as CortexAssistantGenerationStateService,
      config({
        ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED: true,
        ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED: true,
        ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED: true,
        ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_TENANT_IDS: [
          TENANT_ID,
          '33333333-3333-4333-8333-333333333333',
        ],
        ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS: [TENANT_ID],
        ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS: [TENANT_ID],
      })
    )
    expect(producer.scopedRecoveryTenantIds()).toEqual([TENANT_ID])
  })

  it('replaces only terminal Redis envelopes for a PostgreSQL retry', async () => {
    const existing = {
      getState: vi.fn().mockResolvedValue('failed'),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    const queue = {
      getJob: vi.fn().mockResolvedValue(existing),
      add: vi.fn().mockResolvedValue({ id: 'replacement' }),
    } as unknown as Queue
    const producer = new CortexAssistantGenerationJobQueue(
      queue,
      {} as CortexAssistantGenerationStateService,
      config()
    )
    await expect(producer.enqueue(JOB_ID)).resolves.toBe(true)
    expect(existing.remove).toHaveBeenCalledOnce()
    expect(queue.add).toHaveBeenCalledOnce()
  })
})
