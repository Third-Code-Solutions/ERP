import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  routeEnvelopeFromCircuitAlert,
  type CortexAssistantProviderCircuitAlertEvent,
  type CortexAssistantProviderCircuitAlertRouteAdapter,
  type CortexAssistantProviderCircuitAlertRouteFailureCode,
  type CortexAssistantProviderCircuitAlertRouteResult,
} from '@third-code-erp/shared-types'

const ADAPTER_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/

export class CortexAssistantProviderCircuitAlertRouteError extends Error {
  constructor(
    readonly code: Exclude<
      CortexAssistantProviderCircuitAlertRouteFailureCode,
      'route_disabled'
    >
  ) {
    super(code)
    this.name = 'CortexAssistantProviderCircuitAlertRouteError'
  }
}

function failureCode(
  error: unknown
): Exclude<
  CortexAssistantProviderCircuitAlertRouteFailureCode,
  'route_disabled'
> {
  if (error instanceof CortexAssistantProviderCircuitAlertRouteError) {
    return error.code
  }
  return 'route_unknown'
}

/**
 * Provider-neutral alert route authority. It builds the only adapter payload,
 * checks exact-tenant activation, and returns stable failure codes. Adapter
 * credentials stay inside a future adapter implementation; this service never
 * accepts or forwards them.
 */
@Injectable()
export class CortexAssistantProviderCircuitAlertRouter {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService
  ) {}

  enabledForTenant(tenantId: string): boolean {
    return (
      this.config.get<boolean>(
        'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED',
        false
      ) === true &&
      this.config
        .get<string[]>(
          'ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS',
          []
        )
        .includes(tenantId)
    )
  }

  async route(
    event: CortexAssistantProviderCircuitAlertEvent,
    adapter: CortexAssistantProviderCircuitAlertRouteAdapter
  ): Promise<CortexAssistantProviderCircuitAlertRouteResult> {
    const envelope = routeEnvelopeFromCircuitAlert(event)
    if (!this.enabledForTenant(envelope.tenantId)) {
      return {
        eventKey: envelope.eventKey,
        status: 'failed',
        failureCode: 'route_disabled',
      }
    }
    if (!ADAPTER_KEY_PATTERN.test(adapter.key)) {
      return {
        eventKey: envelope.eventKey,
        status: 'failed',
        failureCode: 'route_rejected',
      }
    }

    try {
      await adapter.publish(envelope)
      return {
        eventKey: envelope.eventKey,
        status: 'accepted',
        failureCode: null,
      }
    } catch (error) {
      return {
        eventKey: envelope.eventKey,
        status: 'failed',
        failureCode: failureCode(error),
      }
    }
  }
}
