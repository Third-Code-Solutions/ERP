import { z } from 'zod'

export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_QUEUE =
  'document-upload-reservation-cleanup'
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_JOB =
  'cleanup-terminal-document-upload-reservations'
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER =
  'document-upload-reservation-cleanup-scheduler-v1'
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_INTERVAL_MS = 5 * 60 * 1_000
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_SCHEDULER_REMOVE_TIMEOUT_MS =
  5_000
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_BATCH_SIZE = 25
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_CLAIM_STALE_MINUTES = 5
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_MAX_ATTEMPTS = 6
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_RETRY_BASE_MINUTES = 5
export const DOCUMENT_UPLOAD_RESERVATION_CLEANUP_RETRY_MAX_MINUTES = 60

export const documentUploadReservationCleanupJobSchema = z
  .object({ schemaVersion: z.literal(1) })
  .strict()

export type DocumentUploadReservationCleanupJob = z.infer<
  typeof documentUploadReservationCleanupJobSchema
>
