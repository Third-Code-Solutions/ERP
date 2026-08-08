import { describe, expect, it } from 'vitest'
import {
  cortexAssistantProviderCircuitAlertRouteEnvelopeSchema,
  cortexAssistantProviderCircuitAlertRouteResultSchema,
  routeEnvelopeFromCircuitAlert,
} from './cortex-assistant-provider-circuit-alert-route'

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

describe('Cortex provider circuit alert route contract', () => {
  it('builds bounded provider-neutral envelope from alert evidence', () => {
    expect(routeEnvelopeFromCircuitAlert(EVENT)).toEqual({
      protocolVersion: 1,
      eventKey: EVENT.eventKey,
      eventType: EVENT.eventType,
      tenantId: EVENT.tenantId,
      policyId: EVENT.policyId,
      provider: EVENT.provider,
      model: EVENT.model,
      failureCount: EVENT.failureCount,
      retryAt: EVENT.retryAt,
      asOf: EVENT.asOf,
      runbook: EVENT.runbook,
    })
  })

  it('rejects credentials, URLs, payload text, and unscoped route results', () => {
    const envelope = routeEnvelopeFromCircuitAlert(EVENT)
    expect(
      cortexAssistantProviderCircuitAlertRouteEnvelopeSchema.safeParse({
        ...envelope,
        authorization: 'Bearer secret',
        endpoint: 'https://pager.example.test',
        message: 'raw provider payload',
      }).success
    ).toBe(false)
    expect(
      cortexAssistantProviderCircuitAlertRouteResultSchema.safeParse({
        ...envelope,
        status: 'accepted',
        failureCode: null,
      }).success
    ).toBe(false)
  })

  it('accepts only stable, non-secret failure codes', () => {
    expect(
      cortexAssistantProviderCircuitAlertRouteResultSchema.parse({
        eventKey: EVENT.eventKey,
        status: 'failed',
        failureCode: 'route_rate_limited',
      })
    ).toEqual({
      eventKey: EVENT.eventKey,
      status: 'failed',
      failureCode: 'route_rate_limited',
    })
    expect(
      cortexAssistantProviderCircuitAlertRouteResultSchema.safeParse({
        eventKey: EVENT.eventKey,
        status: 'failed',
        failureCode: 'raw-secret-error',
      }).success
    ).toBe(false)
  })
})
