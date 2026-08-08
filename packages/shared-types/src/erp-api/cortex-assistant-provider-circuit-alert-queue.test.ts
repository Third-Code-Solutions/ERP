import { describe, expect, it } from 'vitest'
import {
  cortexAssistantProviderCircuitAlertQueueJobSchema,
  cortexAssistantProviderCircuitAlertRecoveryJobSchema,
} from './cortex-assistant-provider-circuit-alert-queue'

const EVENT_KEY = 'a'.repeat(64)

describe('Cortex provider circuit alert queue contract', () => {
  it('accepts only an opaque event-key transport envelope', () => {
    expect(
      cortexAssistantProviderCircuitAlertQueueJobSchema.parse({
        schemaVersion: 1,
        eventKey: EVENT_KEY,
      })
    ).toEqual({ schemaVersion: 1, eventKey: EVENT_KEY })
    expect(() =>
      cortexAssistantProviderCircuitAlertQueueJobSchema.parse({
        schemaVersion: 1,
        eventKey: EVENT_KEY,
        tenantId: '22222222-2222-4222-8222-222222222222',
      })
    ).toThrow()
  })

  it('keeps scheduler data identity-free', () => {
    expect(
      cortexAssistantProviderCircuitAlertRecoveryJobSchema.parse({
        schemaVersion: 1,
      })
    ).toEqual({ schemaVersion: 1 })
  })
})
