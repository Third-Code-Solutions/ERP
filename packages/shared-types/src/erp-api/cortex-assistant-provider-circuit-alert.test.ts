import { describe, expect, it } from 'vitest'
import { cortexAssistantProviderCircuitAlertEventSchema } from './cortex-assistant-provider-circuit-alert'

const EVENT = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  policyId: '33333333-3333-4333-8333-333333333333',
  eventKey: 'a'.repeat(64),
  eventType: 'opened',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  failureCount: 3,
  retryAt: '2026-08-08T12:15:00.000Z',
  asOf: '2026-08-08T12:00:00.000Z',
  runbook: 'cortex-provider-circuit',
} as const

describe('Cortex provider circuit alert contract', () => {
  it('accepts aggregate-only transition evidence', () => {
    expect(cortexAssistantProviderCircuitAlertEventSchema.parse(EVENT)).toEqual(
      EVENT
    )
  })

  it('rejects payloads or identity fields outside alert scope', () => {
    expect(
      cortexAssistantProviderCircuitAlertEventSchema.safeParse({
        ...EVENT,
        prompt: 'never persist this',
      }).success
    ).toBe(false)
    expect(
      cortexAssistantProviderCircuitAlertEventSchema.safeParse({
        ...EVENT,
        eventKey: 'not-a-sha256',
      }).success
    ).toBe(false)
  })
})
