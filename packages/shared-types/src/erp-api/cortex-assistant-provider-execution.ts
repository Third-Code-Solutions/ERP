import { z } from 'zod'
import {
  cortexAssistantProviderKeySchema,
  cortexAssistantProviderModelKeySchema,
  cortexAssistantProviderNonNegativeCostMicrosSchema,
  cortexAssistantProviderPositiveCostMicrosSchema,
} from './cortex-assistant-provider-budget'

export const CORTEX_ASSISTANT_PROVIDER_PROTOCOL_VERSION = 1
export const CORTEX_ASSISTANT_PROVIDER_TIMEOUT_MIN_MS = 1_000
export const CORTEX_ASSISTANT_PROVIDER_TIMEOUT_MAX_MS = 60_000

const providerEvidenceSchema = z
  .object({
    nodeId: z.string().uuid(),
    nodeType: z.string().trim().min(1).max(64),
    title: z.string().max(500).nullable(),
    summary: z.string().max(4_000).nullable(),
  })
  .strict()

const providerCitationIdsSchema = z.array(z.string().uuid()).max(12)

function nodeIdsAreUnique(value: {
  evidence?: Array<{ nodeId: string }>
  citationNodeIds?: string[]
}): boolean {
  const ids = value.evidence?.map((item) => item.nodeId) ?? value.citationNodeIds
  return ids === undefined || new Set(ids).size === ids.length
}

export const cortexAssistantProviderPlanSchema = z
  .object({
    provider: cortexAssistantProviderKeySchema,
    model: cortexAssistantProviderModelKeySchema,
    maxCostMicros: cortexAssistantProviderPositiveCostMicrosSchema,
    timeoutMs: z
      .number()
      .int()
      .min(CORTEX_ASSISTANT_PROVIDER_TIMEOUT_MIN_MS)
      .max(CORTEX_ASSISTANT_PROVIDER_TIMEOUT_MAX_MS),
  })
  .strict()

export const cortexAssistantProviderRequestSchema = z
  .object({
    protocolVersion: z.literal(CORTEX_ASSISTANT_PROVIDER_PROTOCOL_VERSION),
    dispatchKey: z.string().regex(/^[0-9a-f]{64}$/),
    provider: cortexAssistantProviderKeySchema,
    model: cortexAssistantProviderModelKeySchema,
    timeoutMs: z
      .number()
      .int()
      .min(CORTEX_ASSISTANT_PROVIDER_TIMEOUT_MIN_MS)
      .max(CORTEX_ASSISTANT_PROVIDER_TIMEOUT_MAX_MS),
    question: z.string().trim().min(1).max(20_000),
    evidence: z.array(providerEvidenceSchema).max(12),
  })
  .strict()
  .refine(nodeIdsAreUnique, {
    message: 'Provider evidence node IDs must be unique',
    path: ['evidence'],
  })

export const cortexAssistantProviderResponseSchema = z
  .object({
    protocolVersion: z.literal(CORTEX_ASSISTANT_PROVIDER_PROTOCOL_VERSION),
    providerRequestId: z
      .string()
      .min(1)
      .max(200)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
        'Invalid provider request receipt'
      ),
    model: cortexAssistantProviderModelKeySchema,
    content: z
      .string()
      .max(100_000)
      .refine((value) => value.trim().length > 0, 'Content is required'),
    citationNodeIds: providerCitationIdsSchema,
    consumedCostMicros: cortexAssistantProviderNonNegativeCostMicrosSchema,
  })
  .strict()
  .refine(nodeIdsAreUnique, {
    message: 'Provider citation node IDs must be unique',
    path: ['citationNodeIds'],
  })

export type CortexAssistantProviderPlan = z.infer<
  typeof cortexAssistantProviderPlanSchema
>
export type CortexAssistantProviderRequest = z.infer<
  typeof cortexAssistantProviderRequestSchema
>
export type CortexAssistantProviderResponse = z.infer<
  typeof cortexAssistantProviderResponseSchema
>
