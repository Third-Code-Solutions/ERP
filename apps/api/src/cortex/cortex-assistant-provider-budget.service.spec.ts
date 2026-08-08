import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
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
      {} as AuditService
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
})
