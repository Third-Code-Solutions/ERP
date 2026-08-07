import { Injectable } from '@nestjs/common'
import type {
  GroundedAnswerEvidence,
  GroundedAnswerResult,
} from '@third-code-erp/ai'

export interface CortexAssistantProviderPlan {
  provider: string
  model: GroundedAnswerResult['model']
  maxCostMicros: string
}

export interface CortexAssistantProviderDispatchInput {
  jobId: string
  attemptNumber: number
  question: string
  evidence: GroundedAnswerEvidence[]
  plan: CortexAssistantProviderPlan
}

export interface CortexAssistantProviderDispatchResult
  extends GroundedAnswerResult {
  consumedCostMicros: string
}

export type CortexAssistantProviderAdapterErrorCode =
  | 'provider_adapter_unavailable'
  | 'provider_request_failed'
  | 'provider_response_invalid'
  | 'provider_outcome_unknown'

export class CortexAssistantProviderAdapterError extends Error {
  constructor(
    readonly code: CortexAssistantProviderAdapterErrorCode,
    readonly retryable: boolean
  ) {
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
    _input: CortexAssistantProviderDispatchInput
  ): Promise<CortexAssistantProviderDispatchResult> {
    throw new CortexAssistantProviderAdapterError(
      'provider_adapter_unavailable',
      false
    )
  }
}
