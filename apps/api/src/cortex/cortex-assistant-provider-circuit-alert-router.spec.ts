import { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type {
  CortexAssistantProviderCircuitAlertRouteAdapter,
  CortexAssistantProviderCircuitAlertRouteEnvelope,
} from '@third-code-erp/shared-types'
import {
  CortexAssistantProviderCircuitAlertRouteError,
  CortexAssistantProviderCircuitAlertRouter,
} from './cortex-assistant-provider-circuit-alert-router'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const EVENT = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
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

function configFor(
  enabled: boolean,
  tenants: string[] = [TENANT_ID]
): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (
        key ===
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED'
      ) {
        return enabled
      }
      if (
        key ===
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS'
      ) {
        return tenants
      }
      return fallback
    }),
  } as unknown as ConfigService
}

class IdempotentLocalFake
  implements CortexAssistantProviderCircuitAlertRouteAdapter
{
  readonly key = 'local-fake'
  readonly envelopes: CortexAssistantProviderCircuitAlertRouteEnvelope[] = []
  private readonly processed = new Set<string>()
  calls = 0

  async publish(
    envelope: CortexAssistantProviderCircuitAlertRouteEnvelope
  ): Promise<void> {
    this.calls += 1
    if (this.processed.has(envelope.eventKey)) return
    this.processed.add(envelope.eventKey)
    this.envelopes.push(envelope)
  }
}

describe('Cortex provider circuit alert router', () => {
  it('fails closed when routing is disabled or tenant is not allowlisted', async () => {
    const disabled = new CortexAssistantProviderCircuitAlertRouter(
      configFor(false)
    )
    const adapter = new IdempotentLocalFake()
    await expect(disabled.route(EVENT, adapter)).resolves.toMatchObject({
      eventKey: EVENT.eventKey,
      status: 'failed',
      failureCode: 'route_disabled',
    })
    expect(adapter.calls).toBe(0)

    const wrongTenant = new CortexAssistantProviderCircuitAlertRouter(
      configFor(true, ['44444444-4444-4444-8444-444444444444'])
    )
    await expect(wrongTenant.route(EVENT, adapter)).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'route_disabled',
    })
    expect(adapter.calls).toBe(0)
  })

  it('forwards bounded scope once per event key through an idempotent fake', async () => {
    const router = new CortexAssistantProviderCircuitAlertRouter(
      configFor(true)
    )
    const adapter = new IdempotentLocalFake()

    await expect(router.route(EVENT, adapter)).resolves.toMatchObject({
      eventKey: EVENT.eventKey,
      status: 'accepted',
      failureCode: null,
    })
    await expect(router.route(EVENT, adapter)).resolves.toMatchObject({
      eventKey: EVENT.eventKey,
      status: 'accepted',
      failureCode: null,
    })
    expect(adapter.calls).toBe(2)
    expect(adapter.envelopes).toHaveLength(1)
    expect(Object.keys(adapter.envelopes[0]!)).toEqual([
      'protocolVersion',
      'eventKey',
      'eventType',
      'tenantId',
      'policyId',
      'provider',
      'model',
      'failureCount',
      'retryAt',
      'asOf',
      'runbook',
    ])
    expect(adapter.envelopes[0]).not.toHaveProperty('credential')
    expect(adapter.envelopes[0]).not.toHaveProperty('prompt')
  })

  it('classifies known adapter failures without returning raw messages', async () => {
    const router = new CortexAssistantProviderCircuitAlertRouter(
      configFor(true)
    )
    const adapter: CortexAssistantProviderCircuitAlertRouteAdapter = {
      key: 'local-fake',
      publish: vi.fn(async () => {
        throw new CortexAssistantProviderCircuitAlertRouteError(
          'route_rate_limited'
        )
      }),
    }
    await expect(router.route(EVENT, adapter)).resolves.toEqual({
      eventKey: EVENT.eventKey,
      status: 'failed',
      failureCode: 'route_rate_limited',
    })

    const unknown: CortexAssistantProviderCircuitAlertRouteAdapter = {
      key: 'local-fake',
      publish: vi.fn(async () => {
        throw new Error('Authorization: bearer do-not-return-this')
      }),
    }
    await expect(router.route(EVENT, unknown)).resolves.toEqual({
      eventKey: EVENT.eventKey,
      status: 'failed',
      failureCode: 'route_unknown',
    })
  })

  it('rejects adapter keys that cannot be treated as stable identifiers', async () => {
    const router = new CortexAssistantProviderCircuitAlertRouter(
      configFor(true)
    )
    const adapter: CortexAssistantProviderCircuitAlertRouteAdapter = {
      key: 'https://pager.example.test?token=secret',
      publish: vi.fn(),
    }
    await expect(router.route(EVENT, adapter)).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'route_rejected',
    })
    expect(adapter.publish).not.toHaveBeenCalled()
  })
})
