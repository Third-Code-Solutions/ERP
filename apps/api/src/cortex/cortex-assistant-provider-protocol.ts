import { createHash } from 'node:crypto'
import {
  CORTEX_ASSISTANT_PROVIDER_PROTOCOL_VERSION,
  cortexAssistantProviderAttemptIdentitySchema,
  cortexAssistantProviderRequestSchema,
  redactCortexText,
  type CortexAssistantProviderPlan,
  type CortexAssistantProviderRequest,
} from '@third-code-erp/shared-types'
import type { ClaimedCortexAssistantGenerationJob } from './cortex-assistant-generation.state'

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function cortexAssistantProviderDispatchKey(
  reservationId: string
): string {
  const parsed = cortexAssistantProviderAttemptIdentitySchema.parse({
    reservationId,
  })
  return sha256(
    JSON.stringify([
      'third-code-cortex-provider-dispatch',
      CORTEX_ASSISTANT_PROVIDER_PROTOCOL_VERSION,
      parsed.reservationId,
    ])
  )
}

export function buildCortexAssistantProviderRequest(input: {
  reservationId: string
  plan: CortexAssistantProviderPlan
  claimed: ClaimedCortexAssistantGenerationJob
}): CortexAssistantProviderRequest {
  return cortexAssistantProviderRequestSchema.parse({
    protocolVersion: CORTEX_ASSISTANT_PROVIDER_PROTOCOL_VERSION,
    dispatchKey: cortexAssistantProviderDispatchKey(input.reservationId),
    provider: input.plan.provider,
    model: input.plan.model,
    timeoutMs: input.plan.timeoutMs,
    question: redactCortexText(input.claimed.question).slice(0, 20_000),
    evidence: input.claimed.evidence.map((item) => ({
      nodeId: item.nodeId,
      nodeType: item.nodeType,
      title:
        item.title === null
          ? null
          : redactCortexText(item.title).slice(0, 500),
      summary:
        item.summary === null
          ? null
          : redactCortexText(item.summary).slice(0, 4_000),
    })),
  })
}

export function cortexAssistantProviderRequestFingerprint(
  request: CortexAssistantProviderRequest
): string {
  const parsed = cortexAssistantProviderRequestSchema.parse(request)
  return sha256(JSON.stringify(parsed))
}

export function cortexAssistantProviderRequestIdHash(
  providerRequestId: string
): string {
  return sha256(providerRequestId)
}
