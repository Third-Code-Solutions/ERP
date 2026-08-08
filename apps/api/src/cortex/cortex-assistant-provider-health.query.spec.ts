import { describe, expect, it } from 'vitest'
import { evaluateCortexAssistantProviderCircuit } from './cortex-assistant-provider-health.query'

const NOW = new Date('2026-08-08T12:00:00.000Z')
const POLICY = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  failureThreshold: 3,
  failureWindowSeconds: 300,
  cooldownSeconds: 900,
}

describe('Cortex assistant provider circuit evaluation', () => {
  it('stays closed after success or fewer than the configured failures', () => {
    expect(
      evaluateCortexAssistantProviderCircuit({
        policy: POLICY,
        failureCount: 1,
        tripped: false,
        latestFailureAt: new Date(NOW.getTime() - 10_000),
        probeAttemptId: null,
        now: NOW,
      })
    ).toMatchObject({ state: 'closed', failureCount: 1 })
    expect(
      evaluateCortexAssistantProviderCircuit({
        policy: POLICY,
        failureCount: 2,
        tripped: false,
        latestFailureAt: new Date(NOW.getTime() - 10_000),
        probeAttemptId: null,
        now: NOW,
      })
    ).toMatchObject({ state: 'closed', failureCount: 2 })
  })

  it('opens during cooldown and becomes one-probe half-open afterward', () => {
    expect(
      evaluateCortexAssistantProviderCircuit({
        policy: POLICY,
        failureCount: 3,
        tripped: true,
        latestFailureAt: new Date(NOW.getTime() - 10_000),
        probeAttemptId: null,
        now: NOW,
      })
    ).toMatchObject({
      state: 'open',
      failureCount: 3,
      probeInFlight: false,
    })
    expect(
      evaluateCortexAssistantProviderCircuit({
        policy: POLICY,
        failureCount: 3,
        tripped: true,
        latestFailureAt: new Date(NOW.getTime() - 1_000_000),
        probeAttemptId: '33333333-3333-4333-8333-333333333333',
        now: NOW,
      })
    ).toMatchObject({
      state: 'half_open',
      failureCount: 3,
      probeInFlight: true,
    })
  })
})
