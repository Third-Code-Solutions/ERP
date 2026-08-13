import { Injectable } from '@nestjs/common'
import type {
  CortexAssistantProviderPlan,
  CortexAssistantProviderRequest,
  CortexAssistantProviderResponse,
} from '@third-code-erp/shared-types'

export type {
  CortexAssistantProviderPlan,
  CortexAssistantProviderRequest,
  CortexAssistantProviderResponse,
}

export type CortexAssistantProviderAdapterErrorCode =
  | 'provider_adapter_unavailable'
  | 'provider_plan_invalid'
  | 'provider_request_timeout'
  | 'provider_rate_limited'
  | 'provider_request_rejected'
  | 'provider_request_failed'
  | 'provider_response_invalid'
  | 'provider_outcome_unknown'

export class CortexAssistantProviderAdapterError extends Error {
  constructor(readonly code: CortexAssistantProviderAdapterErrorCode) {
    super(code)
    this.name = 'CortexAssistantProviderAdapterError'
  }
}

/**
 * Deliberately unavailable production seam. Tests inject an in-memory fake.
 * A real adapter requires a separately approved provider milestone.
 */
@Injectable()
export class CortexAssistantProviderAdapter {
  plan(): CortexAssistantProviderPlan | null {
    return null
  }

  async dispatch(
    _request: CortexAssistantProviderRequest,
    _signal: AbortSignal
  ): Promise<CortexAssistantProviderResponse> {
    throw new CortexAssistantProviderAdapterError(
      'provider_adapter_unavailable'
    )
  }
}
