import { z } from 'zod'
import { isoDateTimeString } from '../iso-datetime'
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
    id: z.string().guid(),
    tenantId: z.string().guid(),
    policyId: z.string().guid(),
    eventKey: cortexAssistantProviderHashSchema,
    eventType: cortexAssistantProviderCircuitAlertEventTypeSchema,
    provider: cortexAssistantProviderKeySchema,
    model: cortexAssistantProviderModelKeySchema,
    failureCount: z.number().int().min(0).max(20),
    retryAt: isoDateTimeString({ offset: true }).nullable(),
    asOf: isoDateTimeString({ offset: true }),
    runbook: z.literal('cortex-provider-circuit'),
  })
  .strict()

export type CortexAssistantProviderCircuitAlertEvent = z.infer<
  typeof cortexAssistantProviderCircuitAlertEventSchema
>
export type CortexAssistantProviderCircuitAlertEventType = z.infer<
  typeof cortexAssistantProviderCircuitAlertEventTypeSchema
>
