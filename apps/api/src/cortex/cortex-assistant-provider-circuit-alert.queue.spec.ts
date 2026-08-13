import 'reflect-metadata'

import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import {
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
} from './cortex-assistant-provider-circuit-alert.constants'
import { CortexAssistantProviderCircuitAlertQueue } from './cortex-assistant-provider-circuit-alert.queue'
import type { CortexAssistantProviderCircuitAlertService } from './cortex-assistant-provider-circuit-alert.service'
import type { CortexAssistantProviderCircuitAlertObservability } from './cortex-assistant-provider-circuit-alert.observability'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const EVENT_KEY = 'a'.repeat(64)
const EVENT = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  policyId: '33333333-3333-4333-8333-333333333333',
  eventKey: EVENT_KEY,
  eventType: 'opened' as const,
  provider: 'openai',
  model: 'gpt-4.1-mini',
  failureCount: 3,
  retryAt: '2026-08-08T12:15:00.000Z',
  asOf: '2026-08-08T12:00:00.000Z',
  runbook: 'cortex-provider-circuit' as const,
}

function config(values: Record<string, unknown> = {}) {
  return {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  }
}

function enabledConfig() {
  return config({
    ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_ENABLED: true,
    ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_TENANT_IDS: [TENANT_ID],
    ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_ENABLED: true,
    ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_TENANT_IDS: [TENANT_ID],
    ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED: true,
    ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS: [TENANT_ID],
    ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_ENABLED: true,
    ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_TENANT_IDS: [TENANT_ID],
  })
}

describe('CortexAssistantProviderCircuitAlertQueue', () => {
  it('fails closed before creating any BullMQ job', async () => {
    const queue = {
      getJob: vi.fn(),
      add: vi.fn(),
    } as unknown as Queue
    const producer = new CortexAssistantProviderCircuitAlertQueue(
      queue,
      {} as CortexAssistantProviderCircuitAlertService,
      config() as never
    )
    await expect(producer.enqueue(EVENT)).resolves.toBe(false)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('publishes opaque event identity with bounded retries and backoff', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({ id: 'transport' }),
    } as unknown as Queue
    const producer = new CortexAssistantProviderCircuitAlertQueue(
      queue,
      {} as CortexAssistantProviderCircuitAlertService,
      enabledConfig() as never
    )
    await expect(producer.enqueue(EVENT)).resolves.toBe(true)
    expect(queue.add).toHaveBeenCalledWith(
      CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB,
      { schemaVersion: 1, eventKey: EVENT_KEY },
      expect.objectContaining({
        jobId: `cortex-provider-circuit-alert1-${EVENT_KEY}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
      })
    )
  })

  it('replaces only terminal transport jobs and keeps active work intact', async () => {
    const terminal = {
      getState: vi.fn().mockResolvedValue('failed'),
      remove: vi.fn().mockResolvedValue(undefined),
    }
    const queue = {
      getJob: vi.fn().mockResolvedValue(terminal),
      add: vi.fn().mockResolvedValue({ id: 'replacement' }),
    } as unknown as Queue
    const producer = new CortexAssistantProviderCircuitAlertQueue(
      queue,
      {} as CortexAssistantProviderCircuitAlertService,
      enabledConfig() as never
    )
    await expect(producer.enqueue(EVENT)).resolves.toBe(true)
    expect(terminal.remove).toHaveBeenCalledOnce()
    expect(queue.add).toHaveBeenCalledOnce()

    const active = {
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    }
    ;(queue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(active)
    await expect(producer.enqueue(EVENT)).resolves.toBe(false)
    expect(active.remove).not.toHaveBeenCalled()
  })

  it('intersects recovery, job, worker, and route tenant scopes', () => {
    const producer = new CortexAssistantProviderCircuitAlertQueue(
      {} as Queue,
      {} as CortexAssistantProviderCircuitAlertService,
      enabledConfig() as never
    )
    expect(producer.scopedRecoveryTenantIds()).toEqual([TENANT_ID])
  })

  it('re-enqueues only database-recoverable event keys in the exact tenant scope', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({ id: 'transport' }),
    } as unknown as Queue
    const alerts = {
      recoverableEventKeys: vi.fn().mockResolvedValue([
        { tenantId: TENANT_ID, eventKey: EVENT_KEY },
        {
          tenantId: '44444444-4444-4444-8444-444444444444',
          eventKey: 'b'.repeat(64),
        },
      ]),
    } as unknown as CortexAssistantProviderCircuitAlertService
    const producer = new CortexAssistantProviderCircuitAlertQueue(
      queue,
      alerts,
      enabledConfig() as never
    )
    await expect(producer.enqueuePending([TENANT_ID])).resolves.toBe(1)
    expect(queue.add).toHaveBeenCalledWith(
      CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB,
      { schemaVersion: 1, eventKey: EVENT_KEY },
      expect.any(Object)
    )
  })

  it('records recovery enqueue outcomes without exposing event identity', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({ id: 'transport' }),
    } as unknown as Queue
    const recordRecoveryFallback = vi.fn()
    const alerts = {
      recoverableEventKeys: vi.fn().mockResolvedValue([
        { tenantId: TENANT_ID, eventKey: EVENT_KEY },
        {
          tenantId: '44444444-4444-4444-8444-444444444444',
          eventKey: 'b'.repeat(64),
        },
      ]),
    } as unknown as CortexAssistantProviderCircuitAlertService
    const producer = new CortexAssistantProviderCircuitAlertQueue(
      queue,
      alerts,
      enabledConfig() as never,
      { recordRecoveryFallback } as unknown as CortexAssistantProviderCircuitAlertObservability
    )

    await expect(producer.enqueuePending([TENANT_ID])).resolves.toBe(1)
    expect(recordRecoveryFallback).toHaveBeenNthCalledWith(1, 'enqueued')
    expect(recordRecoveryFallback).toHaveBeenNthCalledWith(2, 'skipped')
  })

  it('records recovery transport failure before preserving retry behavior', async () => {
    const queue = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    } as unknown as Queue
    const recordRecoveryFallback = vi.fn()
    const alerts = {
      recoverableEventKeys: vi.fn().mockResolvedValue([
        { tenantId: TENANT_ID, eventKey: EVENT_KEY },
      ]),
    } as unknown as CortexAssistantProviderCircuitAlertService
    const producer = new CortexAssistantProviderCircuitAlertQueue(
      queue,
      alerts,
      enabledConfig() as never,
      { recordRecoveryFallback } as unknown as CortexAssistantProviderCircuitAlertObservability
    )

    await expect(producer.enqueuePending([TENANT_ID])).rejects.toThrow(
      'redis unavailable'
    )
    expect(recordRecoveryFallback).toHaveBeenCalledWith('failed')
  })

  it('schedules recovery only when every gate is open', async () => {
    const queue = {
      upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue
    const producer = new CortexAssistantProviderCircuitAlertQueue(
      queue,
      {} as CortexAssistantProviderCircuitAlertService,
      enabledConfig() as never
    )
    await producer.onApplicationBootstrap()
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
      { every: 60_000 },
      expect.objectContaining({
        name: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB,
        data: { schemaVersion: 1 },
      })
    )
  })
})
