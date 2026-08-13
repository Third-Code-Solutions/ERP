export const CORTEX_ASSISTANT_GENERATION_QUEUE =
  'cortex-assistant-generation'
export const CORTEX_ASSISTANT_GENERATION_JOB = 'generate-grounded-answer'
export const CORTEX_ASSISTANT_GENERATION_RECOVERY_JOB =
  'recover-assistant-generation'
export const CORTEX_ASSISTANT_GENERATION_RECOVERY_SCHEDULER =
  'cortex-assistant-generation-recovery-v1'
export const CORTEX_ASSISTANT_GENERATION_ATTEMPTS = 3
export const CORTEX_ASSISTANT_GENERATION_BACKOFF_MS = 1_000
export const CORTEX_ASSISTANT_GENERATION_RECOVERY_INTERVAL_MS = 60_000
export const CORTEX_ASSISTANT_GENERATION_STALE_AFTER_MS = 2 * 60_000
export const CORTEX_ASSISTANT_GENERATION_RECOVERY_BATCH_SIZE = 100
export const CORTEX_ASSISTANT_GENERATION_LEASE_MS = 5 * 60_000

export function cortexAssistantGenerationTransportJobId(jobId: string): string {
  return `cortex-assistant-generation1-${jobId}`
}
