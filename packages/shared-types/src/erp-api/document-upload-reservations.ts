import { z } from 'zod'

import { documentIntakeDocumentTypeSchema } from './document-intake'

export const DOCUMENT_UPLOAD_MAX_BYTES = 100 * 1024 * 1024
export const PROJECT_DOCUMENT_STORAGE_QUOTA_BYTES = 500 * 1024 * 1024
export const DOCUMENT_UPLOAD_RESERVATION_TTL_SECONDS = 2 * 60 * 60
export const DOCUMENT_UPLOAD_SIGNED_CREDENTIAL_MAX_LENGTH = 16_000

const mediaTypePattern =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/

export function normalizeDocumentUploadContentType(value: string): string {
  return (value.split(';', 1)[0] ?? '').trim().toLowerCase()
}

export function isDocumentUploadHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export const documentUploadContentTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .transform(normalizeDocumentUploadContentType)
  .pipe(z.string().min(1).max(127).regex(mediaTypePattern))

export const documentUploadIdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(256)

const descriptionSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim().length === 0 ? null : value,
  z.string().trim().min(1).max(2_000).nullable().optional(),
)

export const documentUploadReservationRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: documentUploadContentTypeSchema.default(
      'application/octet-stream',
    ),
    sizeBytes: z.number().int().min(1).max(DOCUMENT_UPLOAD_MAX_BYTES),
    description: descriptionSchema,
  })
  .strict()

const storagePathSchema = z.string().trim().min(1).max(2_000)

export const documentUploadReservationResultSchema = z
  .object({
    reservationId: z.string().uuid(),
    projectId: z.string().uuid(),
    storagePath: storagePathSchema,
    originalFileName: z.string().trim().min(1).max(255),
    declaredSizeBytes: z.number().int().min(1).max(DOCUMENT_UPLOAD_MAX_BYTES),
    declaredContentType: documentUploadContentTypeSchema,
    expiresAt: z.string().datetime({ offset: true }),
    signedUrl: z
      .string()
      .url()
      .max(DOCUMENT_UPLOAD_SIGNED_CREDENTIAL_MAX_LENGTH)
      .refine(isDocumentUploadHttpUrl),
    token: z
      .string()
      .max(DOCUMENT_UPLOAD_SIGNED_CREDENTIAL_MAX_LENGTH)
      .refine((value) => value.trim().length > 0),
    state: z.literal('active'),
    replayed: z.boolean(),
  })
  .strict()

export const documentUploadReservationMutationBodySchema = z
  .object({})
  .strict()

export const documentUploadReservationCompletionResultSchema = z
  .object({
    reservationId: z.string().uuid(),
    documentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    storagePath: storagePathSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: documentUploadContentTypeSchema,
    sizeBytes: z.number().int().min(1).max(DOCUMENT_UPLOAD_MAX_BYTES),
    description: z.string().trim().min(1).max(2_000).nullable(),
    documentType: documentIntakeDocumentTypeSchema,
    state: z.literal('completed'),
    created: z.boolean(),
    replayed: z.boolean(),
  })
  .strict()

export const documentUploadReservationReleaseResultSchema = z
  .object({
    reservationId: z.string().uuid(),
    projectId: z.string().uuid(),
    storagePath: storagePathSchema,
    state: z.enum(['released', 'expired']),
    replayed: z.boolean(),
  })
  .strict()

export type DocumentUploadReservationRequest = z.infer<
  typeof documentUploadReservationRequestSchema
>
export type DocumentUploadReservationResult = z.infer<
  typeof documentUploadReservationResultSchema
>
export type DocumentUploadReservationMutationBody = z.infer<
  typeof documentUploadReservationMutationBodySchema
>
export type DocumentUploadReservationCompletionResult = z.infer<
  typeof documentUploadReservationCompletionResultSchema
>
export type DocumentUploadReservationReleaseResult = z.infer<
  typeof documentUploadReservationReleaseResultSchema
>
