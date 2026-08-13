import { z } from 'zod'
import { cortexAssistantProviderHashSchema } from './cortex-assistant-provider-budget'

export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_MAX_ATTEMPTS = 3

/** Internal BullMQ transport. It carries only the durable event identity. */
export const cortexAssistantProviderCircuitAlertQueueJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventKey: cortexAssistantProviderHashSchema,
  })
  .strict()

/** Internal scheduler transport. It carries no tenant or ERP authority. */
export const cortexAssistantProviderCircuitAlertRecoveryJobSchema = z
  .object({ schemaVersion: z.literal(1) })
  .strict()

export type CortexAssistantProviderCircuitAlertQueueJob = z.infer<
  typeof cortexAssistantProviderCircuitAlertQueueJobSchema
>
export type CortexAssistantProviderCircuitAlertRecoveryJob = z.infer<
  typeof cortexAssistantProviderCircuitAlertRecoveryJobSchema
>
