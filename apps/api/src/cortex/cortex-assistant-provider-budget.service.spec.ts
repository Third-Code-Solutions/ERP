import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import type { CortexAssistantProviderCircuitAlertService } from './cortex-assistant-provider-circuit-alert.service'
import type { CortexAssistantProviderCircuitAlertQueue } from './cortex-assistant-provider-circuit-alert.queue'
import type { CortexAssistantProviderCircuitAlertObservability } from './cortex-assistant-provider-circuit-alert.observability'
import {
  cortexAssistantProviderReservationHash,
  CortexAssistantProviderBudgetError,
  CortexAssistantProviderBudgetService,
} from './cortex-assistant-provider-budget.service'

const COMMAND = {
  jobId: '11111111-1111-4111-8111-111111111111',
  attemptNumber: 1,
  provider: 'openai',
  model: 'gpt-4.1-mini',
  maxCostMicros: '250000',
} as const

const ALERT_EVENT = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  policyId: '33333333-3333-4333-8333-333333333333',
  eventKey: 'a'.repeat(64),
  eventType: 'opened' as const,
  provider: 'openai',
  model: 'gpt-4.1-mini',
  failureCount: 3,
  retryAt: '2026-08-08T12:15:00.000Z',
  asOf: '2026-08-08T12:00:00.000Z',
  runbook: 'cortex-provider-circuit' as const,
}

describe('CortexAssistantProviderBudgetService', () => {
  it('hashes every idempotency dimension without exposing raw job identity', () => {
    const hash = cortexAssistantProviderReservationHash(COMMAND)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(COMMAND.jobId)
    expect(
      cortexAssistantProviderReservationHash({
        ...COMMAND,
        maxCostMicros: '250001',
      })
    ).not.toBe(hash)
  })

  it('fails before database work while the reservation gate is closed', async () => {
    const transaction = vi.fn()
    const service = new CortexAssistantProviderBudgetService(
      new ConfigService({}),
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService,
      {} as CortexAssistantProviderCircuitAlertService
    )

    await expect(service.reserve(COMMAND)).rejects.toMatchObject({
      code: 'provider_budget_disabled',
    })
    await expect(
      service.markDispatched({
        reservationId: '22222222-2222-4222-8222-222222222222',
        protocolVersion: 1,
        dispatchKey: 'b'.repeat(64),
        requestFingerprint: 'c'.repeat(64),
      })
    ).rejects.toBeInstanceOf(CortexAssistantProviderBudgetError)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('flushes only committed alert events through the post-commit queue seam', async () => {
    const enqueue = vi.fn().mockResolvedValue(true)
    const recordPostCommitEnqueue = vi.fn()
    const service = new CortexAssistantProviderBudgetService(
      new ConfigService({}),
      { client: { transaction: vi.fn() } } as unknown as DatabaseService,
      {} as AuditService,
      {} as CortexAssistantProviderCircuitAlertService,
      { enqueue } as unknown as CortexAssistantProviderCircuitAlertQueue,
      { recordPostCommitEnqueue } as unknown as CortexAssistantProviderCircuitAlertObservability
    )

    await service.enqueueCircuitAlertEventsAfterCommit([ALERT_EVENT])

    expect(enqueue).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith(ALERT_EVENT)
    expect(recordPostCommitEnqueue).toHaveBeenCalledWith('enqueued')
  })

  it('keeps ERP commits independent when transport enqueue fails', async () => {
    const enqueue = vi.fn().mockRejectedValue(new Error('redis unavailable'))
    const recordPostCommitEnqueue = vi.fn()
    const service = new CortexAssistantProviderBudgetService(
      new ConfigService({}),
      { client: { transaction: vi.fn() } } as unknown as DatabaseService,
      {} as AuditService,
      {} as CortexAssistantProviderCircuitAlertService,
      { enqueue } as unknown as CortexAssistantProviderCircuitAlertQueue,
      { recordPostCommitEnqueue } as unknown as CortexAssistantProviderCircuitAlertObservability
    )

    await expect(
      service.enqueueCircuitAlertEventsAfterCommit([ALERT_EVENT])
    ).resolves.toBeUndefined()
    expect(recordPostCommitEnqueue).toHaveBeenCalledWith('failed')
  })
})
