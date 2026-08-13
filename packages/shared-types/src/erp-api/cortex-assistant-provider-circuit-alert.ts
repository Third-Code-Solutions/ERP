import { z } from 'zod'
import {
  cortexAssistantProviderHashSchema,
  cortexAssistantProviderKeySchema,
  cortexAssistantProviderModelKeySchema,
} from './cortex-assistant-provider-budget'

export const cortexAssistantProviderCircuitAlertEventTypeSchema = z.enum([
  'opened',
  'recovered',
])

export const cortexAssistantProviderCircuitAlertEventSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    policyId: z.string().uuid(),
    eventKey: cortexAssistantProviderHashSchema,
    eventType: cortexAssistantProviderCircuitAlertEventTypeSchema,
    provider: cortexAssistantProviderKeySchema,
    model: cortexAssistantProviderModelKeySchema,
    failureCount: z.number().int().min(0).max(20),
    retryAt: z.string().datetime({ offset: true }).nullable(),
    asOf: z.string().datetime({ offset: true }),
    runbook: z.literal('cortex-provider-circuit'),
  })
  .strict()

export type CortexAssistantProviderCircuitAlertEvent = z.infer<
  typeof cortexAssistantProviderCircuitAlertEventSchema
>
export type CortexAssistantProviderCircuitAlertEventType = z.infer<
  typeof cortexAssistantProviderCircuitAlertEventTypeSchema
>
