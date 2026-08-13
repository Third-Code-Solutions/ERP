import { z } from 'zod'
import {
  cortexAssistantProviderCircuitAlertEventTypeSchema,
  cortexAssistantProviderCircuitAlertEventSchema,
} from './cortex-assistant-provider-circuit-alert'
import {
  cortexAssistantProviderHashSchema,
  cortexAssistantProviderKeySchema,
  cortexAssistantProviderModelKeySchema,
} from './cortex-assistant-provider-budget'

export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTE_PROTOCOL_VERSION = 1

/** Stable, non-secret adapter error taxonomy. Never persist adapter messages. */
export const cortexAssistantProviderCircuitAlertRouteFailureCodeSchema =
  z.enum([
    'route_disabled',
    'route_unavailable',
    'route_rejected',
    'route_rate_limited',
    'route_timeout',
    'route_unknown',
  ])

/**
 * Provider-neutral route payload. This is the complete adapter boundary:
 * credentials, URLs, prompt text, response text, and user identity are not
 * representable here.
 */
export const cortexAssistantProviderCircuitAlertRouteEnvelopeSchema = z
  .object({
    protocolVersion: z.literal(
      CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTE_PROTOCOL_VERSION
    ),
    eventKey: cortexAssistantProviderHashSchema,
    eventType: cortexAssistantProviderCircuitAlertEventTypeSchema,
    tenantId: z.string().uuid(),
    policyId: z.string().uuid(),
    provider: cortexAssistantProviderKeySchema,
    model: cortexAssistantProviderModelKeySchema,
    failureCount: z.number().int().min(0).max(20),
    retryAt: z.string().datetime({ offset: true }).nullable(),
    asOf: z.string().datetime({ offset: true }),
    runbook: z.literal('cortex-provider-circuit'),
  })
  .strict()

export const cortexAssistantProviderCircuitAlertRouteResultSchema = z
  .object({
    eventKey: cortexAssistantProviderHashSchema,
    status: z.enum(['accepted', 'failed']),
    failureCode:
      cortexAssistantProviderCircuitAlertRouteFailureCodeSchema.nullable(),
  })
  .strict()

export type CortexAssistantProviderCircuitAlertRouteEnvelope = z.infer<
  typeof cortexAssistantProviderCircuitAlertRouteEnvelopeSchema
>
export type CortexAssistantProviderCircuitAlertRouteFailureCode = z.infer<
  typeof cortexAssistantProviderCircuitAlertRouteFailureCodeSchema
>
export type CortexAssistantProviderCircuitAlertRouteResult = z.infer<
  typeof cortexAssistantProviderCircuitAlertRouteResultSchema
>

export interface CortexAssistantProviderCircuitAlertRouteAdapter {
  /** Stable adapter identifier. Must never contain a credential or URL. */
  readonly key: string
  /** Adapter must treat eventKey as its idempotency key. */
  publish(
    envelope: CortexAssistantProviderCircuitAlertRouteEnvelope
  ): Promise<void>
}

export function routeEnvelopeFromCircuitAlert(
  event: unknown
): CortexAssistantProviderCircuitAlertRouteEnvelope {
  const alert = cortexAssistantProviderCircuitAlertEventSchema.parse(event)
  return cortexAssistantProviderCircuitAlertRouteEnvelopeSchema.parse({
    protocolVersion:
      CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTE_PROTOCOL_VERSION,
    eventKey: alert.eventKey,
    eventType: alert.eventType,
    tenantId: alert.tenantId,
    policyId: alert.policyId,
    provider: alert.provider,
    model: alert.model,
    failureCount: alert.failureCount,
    retryAt: alert.retryAt,
    asOf: alert.asOf,
    runbook: alert.runbook,
  })
}
