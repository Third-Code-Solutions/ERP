export const DOCUMENT_PROCESSING_QUEUE = 'document-processing'
export const DOCUMENT_PROCESSING_JOB = 'process-document'
export const DOCUMENT_PROCESSING_RECOVERY_JOB =
  'recover-document-processing'
export const DOCUMENT_PROCESSING_RECOVERY_SCHEDULER =
  'document-processing-recovery-v1'
export const DOCUMENT_PROCESSING_RECOVERY_INTERVAL_MS = 60_000
export const DOCUMENT_PROCESSING_ATTEMPTS = 5
export const DOCUMENT_PROCESSING_BACKOFF_MS = 1_000
export const DOCUMENT_PROCESSING_STALE_AFTER_MS = 5 * 60_000
export const DOCUMENT_PROCESSING_RECOVERY_BATCH_SIZE = 100

export function documentProcessingJobId(jobId: string): string {
  return `document-processing1-${jobId}`
}
