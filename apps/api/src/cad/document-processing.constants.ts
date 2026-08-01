export const DOCUMENT_PROCESSING_QUEUE = 'document-processing'
export const DOCUMENT_PROCESSING_JOB = 'process-document'
export const DOCUMENT_PROCESSING_ATTEMPTS = 3
export const DOCUMENT_PROCESSING_BACKOFF_MS = 1_000

export function documentProcessingJobId(jobId: string): string {
  return `document-processing1-${jobId}`
}
