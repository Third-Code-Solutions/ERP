import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import type { ProviderQuotaService } from '../observability/provider-quota.service'
import {
  CORTEX_SEMANTIC_INDEX_JOB,
  CORTEX_SEMANTIC_INDEX_RECOVERY_JOB,
  CORTEX_SEMANTIC_INDEX_RECOVERY_SCHEDULER,
} from './cortex-semantic-index.constants'
import { CortexSemanticIndexProcessor } from './cortex-semantic-index.processor'
import type { CortexSemanticIndexJobQueue } from './cortex-semantic-index.queue'
import type { CortexSemanticIndexStateService } from './cortex-semantic-index.state'
import {
  CortexSemanticIndexWorkerError,
  type CortexSemanticIndexWorkerClient,
} from './cortex-semantic-index.worker'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const NODE_ID = '44444444-4444-4444-8444-444444444444'
const CLAIMED = {
  jobId: JOB_ID,
  tenantId: TENANT_ID,
  requestedBy: USER_ID,
  role: 'admin' as const,
  email: 'admin@example.test',
  attempt: 1,
  nodes: [{ id: NODE_ID, text: 'project — Tower' }],
}

function transportJob(overrides: Partial<Job> = {}): Job {
  return {
    name: CORTEX_SEMANTIC_INDEX_JOB,
    data: { schemaVersion: 1, jobId: JOB_ID },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job
}

function harness() {
  const values: Record<string, unknown> = {
    ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED: true,
    ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS: [TENANT_ID],
    ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED: true,
    ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS: [TENANT_ID],
  }
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService
  const state = {
    claim: vi.fn().mockResolvedValue(CLAIMED),
    reserveProviderCall: vi.fn().mockResolvedValue(true),
    succeed: vi.fn().mockResolvedValue(1),
    fail: vi.fn().mockResolvedValue(true),
  } as unknown as CortexSemanticIndexStateService
  const worker = {
    embed: vi.fn().mockResolvedValue([new Array(1_536).fill(0.01)]),
  } as unknown as CortexSemanticIndexWorkerClient
  const quota = {
    consume: vi.fn().mockResolvedValue({ allowed: true }),
  } as unknown as ProviderQuotaService
  const queue = {
    scopedRecoveryTenantIds: vi.fn().mockReturnValue([TENANT_ID]),
    enqueuePending: vi.fn().mockResolvedValue(1),
  } as unknown as CortexSemanticIndexJobQueue
  const processor = new CortexSemanticIndexProcessor(
    config,
    state,
    worker,
    quota,
    queue
  )
  return { processor, state, worker, quota, queue, values }
}

describe('CortexSemanticIndexProcessor', () => {
  it('reserves exactly one provider call before Python and atomically closes state', async () => {
    const probe = harness()
    await expect(probe.processor.process(transportJob())).resolves.toEqual({
      status: 'succeeded',
      jobId: JOB_ID,
      processedNodes: 1,
    })
    expect(probe.quota.consume).toHaveBeenCalledWith('provider-embedding', {
      tenantId: TENANT_ID,
      userId: USER_ID,
    })
    expect(probe.state.reserveProviderCall).toHaveBeenCalledTimes(1)
    expect(probe.worker.embed).toHaveBeenCalledWith(['project — Tower'])
    expect(probe.state.succeed).toHaveBeenCalledWith(
      JOB_ID,
      TENANT_ID,
      [NODE_ID],
      expect.arrayContaining([expect.any(Array)])
    )
  })

  it('never reserves or calls Python when quota rejects the attempt', async () => {
    const probe = harness()
    ;(probe.quota.consume as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
    })
    await expect(probe.processor.process(transportJob())).rejects.toMatchObject({
      code: 'provider_quota_exceeded',
    })
    expect(probe.state.reserveProviderCall).not.toHaveBeenCalled()
    expect(probe.worker.embed).not.toHaveBeenCalled()
  })

  it('terminally records an uncertain provider outcome and cannot call twice', async () => {
    const probe = harness()
    ;(probe.worker.embed as ReturnType<typeof vi.fn>).mockRejectedValue(
      new CortexSemanticIndexWorkerError('provider_outcome_unknown')
    )
    await expect(probe.processor.process(transportJob())).rejects.toMatchObject({
      code: 'provider_outcome_unknown',
    })
    expect(probe.state.reserveProviderCall).toHaveBeenCalledTimes(1)
    expect(probe.worker.embed).toHaveBeenCalledTimes(1)
    expect(probe.state.fail).toHaveBeenCalledWith(
      JOB_ID,
      'provider_outcome_unknown'
    )
    expect(probe.state.succeed).not.toHaveBeenCalled()
  })

  it('runs recovery only through the identity-only scheduler envelope', async () => {
    const probe = harness()
    const job = transportJob({
      name: CORTEX_SEMANTIC_INDEX_RECOVERY_JOB,
      data: { schemaVersion: 1 },
    })
    await expect(probe.processor.process(job)).resolves.toEqual({
      status: 'succeeded',
      jobId: CORTEX_SEMANTIC_INDEX_RECOVERY_SCHEDULER,
      recoveredJobs: 1,
    })
    expect(probe.queue.enqueuePending).toHaveBeenCalledWith([TENANT_ID])
    expect(probe.state.claim).not.toHaveBeenCalled()
  })
})
