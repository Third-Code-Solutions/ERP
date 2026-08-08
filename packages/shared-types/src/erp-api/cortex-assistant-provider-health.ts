import { z } from 'zod'
import {
  cortexAssistantProviderKeySchema,
  cortexAssistantProviderModelKeySchema,
  cortexAssistantProviderNonNegativeCostMicrosSchema,
  cortexAssistantProviderPositiveCostMicrosSchema,
} from './cortex-assistant-provider-budget'

export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_FAILURE_THRESHOLD_DEFAULT = 3
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_FAILURE_THRESHOLD_MAX = 20
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_WINDOW_SECONDS_DEFAULT = 300
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_COOLDOWN_SECONDS_DEFAULT = 900
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_SECONDS_MIN = 60
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_SECONDS_MAX = 86_400
export const CORTEX_ASSISTANT_PROVIDER_LATENCY_MAX_MS = 2_678_400_000

const boundedCountSchema = z.number().int().min(0).max(2_147_483_647)
const boundedLatencySchema = z
  .number()
  .int()
  .min(0)
  .max(CORTEX_ASSISTANT_PROVIDER_LATENCY_MAX_MS)
  .nullable()

export const cortexAssistantProviderHealthQuerySchema = z
  .object({
    provider: cortexAssistantProviderKeySchema,
    model: cortexAssistantProviderModelKeySchema,
  })
  .strict()

export const cortexAssistantProviderCircuitStateSchema = z.enum([
  'closed',
  'open',
  'half_open',
])

export const cortexAssistantProviderHealthResultSchema = z
  .object({
    asOf: z.string().datetime({ offset: true }),
    budgetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    provider: cortexAssistantProviderKeySchema,
    model: cortexAssistantProviderModelKeySchema,
    policyEnabled: z.boolean(),
    requestLimitMicros: cortexAssistantProviderPositiveCostMicrosSchema,
    dailyLimitMicros: cortexAssistantProviderPositiveCostMicrosSchema,
    spend: z
      .object({
        heldMicros: cortexAssistantProviderNonNegativeCostMicrosSchema,
        consumedMicros: cortexAssistantProviderNonNegativeCostMicrosSchema,
        remainingMicros: cortexAssistantProviderNonNegativeCostMicrosSchema,
      })
      .strict(),
    attempts: z
      .object({
        reserved: boundedCountSchema,
        dispatched: boundedCountSchema,
        succeeded: boundedCountSchema,
        failed: boundedCountSchema,
        outcomeUnknown: boundedCountSchema,
      })
      .strict(),
    latencyMs: z
      .object({
        p50: boundedLatencySchema,
        p95: boundedLatencySchema,
        p99: boundedLatencySchema,
      })
      .strict(),
    circuit: z
      .object({
        state: cortexAssistantProviderCircuitStateSchema,
        failureThreshold: z
          .number()
          .int()
          .min(1)
          .max(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_FAILURE_THRESHOLD_MAX),
        failureWindowSeconds: z
          .number()
          .int()
          .min(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_SECONDS_MIN)
          .max(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_SECONDS_MAX),
        cooldownSeconds: z
          .number()
          .int()
          .min(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_SECONDS_MIN)
          .max(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_SECONDS_MAX),
        failureCount: z
          .number()
          .int()
          .min(0)
          .max(CORTEX_ASSISTANT_PROVIDER_CIRCUIT_FAILURE_THRESHOLD_MAX),
        retryAt: z.string().datetime({ offset: true }).nullable(),
        probeInFlight: z.boolean(),
      })
      .strict(),
    runbook: z.literal('cortex-provider-circuit'),
  })
  .strict()

export type CortexAssistantProviderHealthQuery = z.infer<
  typeof cortexAssistantProviderHealthQuerySchema
>
export type CortexAssistantProviderCircuitState = z.infer<
  typeof cortexAssistantProviderCircuitStateSchema
>
export type CortexAssistantProviderHealthResult = z.infer<
  typeof cortexAssistantProviderHealthResultSchema
>
