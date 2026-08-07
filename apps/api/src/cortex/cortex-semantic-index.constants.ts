export const CORTEX_SEMANTIC_INDEX_QUEUE = 'cortex-semantic-index'
export const CORTEX_SEMANTIC_INDEX_JOB = 'index-cortex-nodes'
export const CORTEX_SEMANTIC_INDEX_RECOVERY_JOB =
  'recover-cortex-semantic-index'
export const CORTEX_SEMANTIC_INDEX_RECOVERY_SCHEDULER =
  'cortex-semantic-index-recovery-v1'
export const CORTEX_SEMANTIC_INDEX_RECOVERY_INTERVAL_MS = 60_000
export const CORTEX_SEMANTIC_INDEX_ATTEMPTS = 3
export const CORTEX_SEMANTIC_INDEX_BACKOFF_MS = 2_000
export const CORTEX_SEMANTIC_INDEX_STALE_AFTER_MS = 5 * 60_000
export const CORTEX_SEMANTIC_INDEX_RECOVERY_BATCH_SIZE = 100

export function cortexSemanticIndexTransportJobId(jobId: string): string {
  return `cortex-semantic-index1-${jobId}`
}
