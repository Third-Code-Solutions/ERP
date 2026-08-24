import { z } from 'zod'

export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_QUEUE =
  'document-upload-reservation-reconciliation'
export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_JOB =
  'report-document-upload-reservation-drift'
export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_SCHEDULER_PREFIX =
  'document-upload-reservation-reconciliation-v1'
export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_INTERVAL_MS =
  60 * 60 * 1_000
export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_PAGE_SIZE = 25
export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGE_SIZE = 50
export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ORPHAN_GRACE_MS =
  24 * 60 * 60 * 1_000
export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_CURSOR_MAX_LENGTH =
  4_096
export const DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES = 1_000

const normalizedTenantIdSchema = z
  .string()
  .uuid()
  .transform((tenantId) => tenantId.toLowerCase())
const canonicalUuidSchema = z
  .string()
  .uuid()
  .refine((value) => value === value.toLowerCase())

const opaqueCursorSchema = z
  .string()
  .min(1)
  .max(DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_CURSOR_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_-]+$/)

export const documentUploadReservationReconciliationJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: normalizedTenantIdSchema,
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGE_SIZE),
    cursor: opaqueCursorSchema.optional(),
  })
  .strict()

const terminalCursorSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: canonicalUuidSchema,
    phase: z.literal('terminal'),
    page: z.number().int().min(1).max(
      DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES
    ),
    afterId: canonicalUuidSchema,
  })
  .strict()

const completedCursorSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: canonicalUuidSchema,
    phase: z.literal('completed'),
    page: z.number().int().min(1).max(
      DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES
    ),
    afterId: canonicalUuidSchema.optional(),
  })
  .strict()

const objectCursorSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: canonicalUuidSchema,
    phase: z.literal('objects'),
    page: z.number().int().min(1).max(
      DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_MAX_PAGES
    ),
    storageCursor: z.string().min(1).max(2_048).optional(),
  })
  .strict()

const reconciliationCursorSchema = z.discriminatedUnion('phase', [
  terminalCursorSchema,
  completedCursorSchema,
  objectCursorSchema,
])

export type DocumentUploadReservationReconciliationJob = z.infer<
  typeof documentUploadReservationReconciliationJobSchema
>
export type DocumentUploadReservationReconciliationCursor = z.infer<
  typeof reconciliationCursorSchema
>

export function encodeDocumentUploadReservationReconciliationCursor(
  cursor: DocumentUploadReservationReconciliationCursor
): string {
  const parsed = reconciliationCursorSchema.parse(cursor)
  return Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64url')
}

export function decodeDocumentUploadReservationReconciliationCursor(
  value: string,
  tenantId: string
): DocumentUploadReservationReconciliationCursor {
  const opaque = opaqueCursorSchema.parse(value)
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(opaque, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Invalid document upload reconciliation cursor')
  }
  const parsed = reconciliationCursorSchema.safeParse(decoded)
  if (!parsed.success || parsed.data.tenantId !== tenantId) {
    throw new Error('Invalid document upload reconciliation cursor')
  }
  if (encodeDocumentUploadReservationReconciliationCursor(parsed.data) !== opaque) {
    throw new Error('Invalid document upload reconciliation cursor')
  }
  return parsed.data
}
