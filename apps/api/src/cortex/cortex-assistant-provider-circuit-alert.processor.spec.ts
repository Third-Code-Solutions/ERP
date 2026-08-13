import 'reflect-metadata'

import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import type {
  CortexAssistantProviderCircuitAlertRouteAdapter,
} from '@third-code-erp/shared-types'
import {
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB,
  CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
} from './cortex-assistant-provider-circuit-alert.constants'
import { CortexAssistantProviderCircuitAlertProcessor, CortexAssistantProviderCircuitAlertQueueError } from './cortex-assistant-provider-circuit-alert.processor'
import type { CortexAssistantProviderCircuitAlertRouter } from './cortex-assistant-provider-circuit-alert-router'
import type { CortexAssistantProviderCircuitAlertQueue } from './cortex-assistant-provider-circuit-alert.queue'
import type { CortexAssistantProviderCircuitAlertService } from './cortex-assistant-provider-circuit-alert.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const EVENT_KEY = 'a'.repeat(64)

function job(overrides: Partial<Job> = {}): Job {
  return {
    name: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB,
    data: { schemaVersion: 1, eventKey: EVENT_KEY },
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  } as Job
}

function harness() {
  const alerts = {
    tenantIdForEventKey: vi.fn().mockResolvedValue(TENANT_ID),
    deliverEventKeyThroughRoute: vi.fn().mockResolvedValue({
      eventKey: EVENT_KEY,
      status: 'delivered',
      failureCode: null,
    }),
  } as unknown as CortexAssistantProviderCircuitAlertService
  const router = {} as CortexAssistantProviderCircuitAlertRouter
  const queue = {
    workerAllowed: vi.fn().mockReturnValue(true),
    scopedRecoveryTenantIds: vi.fn().mockReturnValue([TENANT_ID]),
    enqueuePending: vi.fn().mockResolvedValue(2),
  } as unknown as CortexAssistantProviderCircuitAlertQueue
  const adapter: CortexAssistantProviderCircuitAlertRouteAdapter = {
    key: 'local-fake',
    publish: vi.fn(),
  }
  const processor = new CortexAssistantProviderCircuitAlertProcessor(
    alerts,
    router,
    queue,
    adapter
  )
  return { processor, alerts, router, queue, adapter }
}

describe('CortexAssistantProviderCircuitAlertProcessor', () => {
  it('reloads tenant scope and routes only the opaque event key', async () => {
    const probe = harness()
    await expect(probe.processor.process(job())).resolves.toEqual({
      status: 'succeeded',
      eventKey: EVENT_KEY,
    })
    expect(probe.alerts.tenantIdForEventKey).toHaveBeenCalledWith(EVENT_KEY)
    expect(probe.alerts.deliverEventKeyThroughRoute).toHaveBeenCalledWith(
      EVENT_KEY,
      probe.router,
      probe.adapter
    )
  })

  it('does not claim or route when the worker scope is closed', async () => {
    const probe = harness()
    ;(probe.queue.workerAllowed as ReturnType<typeof vi.fn>).mockReturnValue(
      false
    )
    await expect(probe.processor.process(job())).resolves.toEqual({
      status: 'ignored',
      eventKey: EVENT_KEY,
    })
    expect(probe.alerts.deliverEventKeyThroughRoute).not.toHaveBeenCalled()
  })

  it('turns a stable durable route failure into a bounded BullMQ retry', async () => {
    const probe = harness()
    ;(probe.alerts.deliverEventKeyThroughRoute as ReturnType<typeof vi.fn>).mockResolvedValue({
      eventKey: EVENT_KEY,
      status: 'failed',
      failureCode: 'route_rate_limited',
    })
    await expect(probe.processor.process(job())).rejects.toMatchObject({
      code: 'route_rate_limited',
    })
    expect(
      new CortexAssistantProviderCircuitAlertQueueError('route_rate_limited')
    ).toBeInstanceOf(Error)
  })

  it('runs recovery through the identity-free scheduler envelope', async () => {
    const probe = harness()
    await expect(
      probe.processor.process(
        job({
          name: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB,
          data: { schemaVersion: 1 },
        })
      )
    ).resolves.toEqual({
      status: 'succeeded',
      eventKey: CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER,
      recoveredJobs: 2,
    })
    expect(probe.queue.enqueuePending).toHaveBeenCalledWith([TENANT_ID])
  })
})
