export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_QUEUE =
  'cortex-assistant-provider-circuit-alert'
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOB =
  'deliver-cortex-provider-circuit-alert'
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_JOB =
  'recover-cortex-provider-circuit-alert'
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_SCHEDULER =
  'cortex-provider-circuit-alert-recovery-v1'
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ATTEMPTS = 3
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_BACKOFF_MS = 2_000
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_INTERVAL_MS =
  60_000
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_STALE_AFTER_MS =
  5 * 60_000
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_BATCH_SIZE = 100
export const CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTE_ADAPTER =
  'CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTE_ADAPTER'

export function cortexAssistantProviderCircuitAlertTransportJobId(
  eventKey: string
): string {
  return `cortex-provider-circuit-alert1-${eventKey}`
}
