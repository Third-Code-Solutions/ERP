import 'reflect-metadata'

import type { ConfigService } from '@nestjs/config'
import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import {
  CORTEX_ASSISTANT_GENERATION_JOB,
  CORTEX_ASSISTANT_GENERATION_RECOVERY_JOB,
  CORTEX_ASSISTANT_GENERATION_RECOVERY_SCHEDULER,
} from './cortex-assistant-generation.constants'
import { CortexAssistantGenerationProcessor } from './cortex-assistant-generation.processor'
import type { CortexAssistantGenerationJobQueue } from './cortex-assistant-generation.queue'
import type { CortexAssistantGenerationStateService } from './cortex-assistant-generation.state'
import type { CortexAssistantGenerationWorkerClient } from './cortex-assistant-generation.worker'
import type { CortexAssistantTurnsService } from './cortex-assistant-turns.service'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const TENANT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'
const NODE_ID = '55555555-5555-4555-8555-555555555555'

function transportJob(overrides: Partial<Job> = {}): Job {
  return {
    name: CORTEX_ASSISTANT_GENERATION_JOB,
    data: { schemaVersion: 1, jobId: JOB_ID },
    ...overrides,
  } as Job
}

function harness() {
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED: true,
        ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS: [TENANT_ID],
        ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED: true,
        ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS: [TENANT_ID],
      }
      return values[key] ?? fallback
    }),
  } as unknown as ConfigService
  const state = {
    claim: vi.fn().mockResolvedValue({
      jobId: JOB_ID,
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      claimTokenHash: 'a'.repeat(64),
      question: 'What changed?',
      evidence: [
        { nodeId: NODE_ID, nodeType: 'project', title: 'Tower', summary: null },
      ],
    }),
    failTerminal: vi.fn().mockResolvedValue(undefined),
    retryOrFail: vi.fn().mockResolvedValue(undefined),
  } as unknown as CortexAssistantGenerationStateService
  const worker = {
    generate: vi.fn().mockResolvedValue({
      content: 'Grounded answer',
      citationNodeIds: [NODE_ID],
      model: 'deterministic-grounded-v1',
    }),
  } as unknown as CortexAssistantGenerationWorkerClient
  const assistantTurns = {
    completeFromWorker: vi.fn().mockResolvedValue(true),
  } as unknown as CortexAssistantTurnsService
  const queue = {
    scopedRecoveryTenantIds: vi.fn().mockReturnValue([TENANT_ID]),
    enqueuePending: vi.fn().mockResolvedValue(2),
  } as unknown as CortexAssistantGenerationJobQueue
  return {
    processor: new CortexAssistantGenerationProcessor(
      config,
      state,
      worker,
      assistantTurns,
      queue
    ),
    state,
    worker,
    assistantTurns,
    queue,
  }
}

describe('CortexAssistantGenerationProcessor', () => {
  it('lets Python analyze but lets Nest commit the official turn', async () => {
    const probe = harness()
    await expect(probe.processor.process(transportJob())).resolves.toEqual({
      status: 'succeeded',
      jobId: JOB_ID,
    })
    expect(probe.worker.generate).toHaveBeenCalledWith(
      'What changed?',
      expect.arrayContaining([expect.objectContaining({ nodeId: NODE_ID })])
    )
    expect(probe.assistantTurns.completeFromWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: JOB_ID,
        requestId: REQUEST_ID,
        content: 'Grounded answer',
      })
    )
  })

  it('records retryable worker failure in PostgreSQL state', async () => {
    const probe = harness()
    ;(probe.worker.generate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('offline')
    )
    await expect(probe.processor.process(transportJob())).rejects.toThrow(
      'offline'
    )
    expect(probe.state.retryOrFail).toHaveBeenCalledWith(
      JOB_ID,
      'a'.repeat(64),
      'assistant_generation_failed'
    )
    expect(probe.assistantTurns.completeFromWorker).not.toHaveBeenCalled()
  })

  it('runs recovery only through the identity-only scheduler envelope', async () => {
    const probe = harness()
    await expect(
      probe.processor.process(
        transportJob({
          name: CORTEX_ASSISTANT_GENERATION_RECOVERY_JOB,
          data: { schemaVersion: 1 },
        })
      )
    ).resolves.toEqual({
      status: 'succeeded',
      jobId: CORTEX_ASSISTANT_GENERATION_RECOVERY_SCHEDULER,
      recoveredJobs: 2,
    })
    expect(probe.queue.enqueuePending).toHaveBeenCalledWith([TENANT_ID])
    expect(probe.state.claim).not.toHaveBeenCalled()
  })
})
