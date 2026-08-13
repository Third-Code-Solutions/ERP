import { describe, expect, it } from 'vitest'
import {
  cortexAssistantProviderHealthQuerySchema,
  cortexAssistantProviderHealthResultSchema,
} from './cortex-assistant-provider-health'

const HEALTH = {
  asOf: '2026-08-08T12:00:00.000Z',
  budgetDate: '2026-08-08',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  policyEnabled: false,
  requestLimitMicros: '400',
  dailyLimitMicros: '1000',
  spend: {
    heldMicros: '300',
    consumedMicros: '200',
    remainingMicros: '500',
  },
  attempts: {
    reserved: 1,
    dispatched: 0,
    succeeded: 1,
    failed: 2,
    outcomeUnknown: 1,
  },
  latencyMs: { p50: 120, p95: 900, p99: 900 },
  circuit: {
    state: 'open',
    failureThreshold: 3,
    failureWindowSeconds: 300,
    cooldownSeconds: 900,
    failureCount: 3,
    retryAt: '2026-08-08T12:15:00.000Z',
    probeInFlight: false,
  },
  runbook: 'cortex-provider-circuit',
} as const

describe('Cortex assistant provider health contracts', () => {
  it('accepts one aggregate-only tenant-derived health result', () => {
    expect(cortexAssistantProviderHealthResultSchema.parse(HEALTH)).toEqual(
      HEALTH
    )
  })

  it('rejects caller scope, negative spend, and unbounded circuit policy', () => {
    expect(
      cortexAssistantProviderHealthQuerySchema.safeParse({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        tenantId: '11111111-1111-4111-8111-111111111111',
      }).success
    ).toBe(false)
    expect(
      cortexAssistantProviderHealthResultSchema.safeParse({
        ...HEALTH,
        spend: { ...HEALTH.spend, heldMicros: '-1' },
      }).success
    ).toBe(false)
    expect(
      cortexAssistantProviderHealthResultSchema.safeParse({
        ...HEALTH,
        circuit: { ...HEALTH.circuit, failureThreshold: 21 },
      }).success
    ).toBe(false)
  })
})
