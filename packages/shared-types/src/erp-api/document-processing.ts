import { z } from 'zod'

export const DOCUMENT_PROCESSING_MAX_WARNINGS = 100
export const DOCUMENT_PROCESSING_MAX_FAILURE_CODE = 100
export const DOCUMENT_PROCESSING_MAX_ITEMS = 5_000
export const DOCUMENT_PROCESSING_MAX_SOURCE_BYTES = 100 * 1024 * 1024
export const DOCUMENT_PROCESSING_MAX_ATTEMPTS = 5

export const documentProcessingRequestSchema = z
  .object({
    mode: z.literal('cad'),
    requestedFormat: z.enum(['auto', 'dxf', 'dwg']),
    createDraftBom: z.boolean(),
  })
  .strict()

export const documentProcessingQueueJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.string().uuid(),
  })
  .strict()

export const documentProcessingStatusSchema = z
  .object({
    jobId: z.string().uuid(),
    documentId: z.string().uuid(),
    status: z.enum(['queued', 'processing', 'succeeded', 'failed']),
    attempts: z.number().int().nonnegative(),
    scopeItemsCreated: z.number().int().nonnegative(),
    draftBomId: z.string().uuid().nullable(),
    warnings: z
      .array(z.string().max(500))
      .max(DOCUMENT_PROCESSING_MAX_WARNINGS),
    failureCode: z
      .string()
      .trim()
      .min(1)
      .max(DOCUMENT_PROCESSING_MAX_FAILURE_CODE)
      .nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const documentProcessingAcceptedSchema = z
  .object({
    jobId: z.string().uuid(),
    status: z.literal('queued'),
    documentId: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

/**
 * Private Nest-to-worker request. This is deliberately separate from the
 * public command and contains no tenant, project, actor, or queue authority.
 * The signed URL is short-lived and must never be persisted or logged.
 */
export const documentProcessingWorkerRequestSchema = z
  .object({
    job_id: z.string().uuid(),
    attempt: z.number().int().min(1).max(DOCUMENT_PROCESSING_MAX_ATTEMPTS),
    source_url: z
      .string()
      .url()
      .refine((value) => {
        const protocol = new URL(value).protocol
        return protocol === 'http:' || protocol === 'https:'
      }, 'must use http or https'),
    source_format: z.enum(['dxf', 'dwg']),
    file_name: z.string().max(255).nullable(),
    limits: z
      .object({
        max_bytes: z
          .number()
          .int()
          .positive()
          .max(DOCUMENT_PROCESSING_MAX_SOURCE_BYTES),
        max_items: z
          .number()
          .int()
          .positive()
          .max(DOCUMENT_PROCESSING_MAX_ITEMS),
      })
      .strict(),
  })
  .strict()

export const documentProcessingWorkerEvidenceItemSchema = z
  .object({
    item_key: z.string().regex(/^[0-9a-f]{64}$/),
    code: z.string().max(50).nullable(),
    description: z.string().trim().min(1).max(4_000),
    unit: z.string().trim().min(1).max(20),
    quantity: z.number().int().positive().max(2_147_483_647),
    recommended_unit_cost_cents: z
      .number()
      .int()
      .nonnegative()
      .max(9_000_000_000),
    notes: z.string().max(2_000).nullable(),
  })
  .strict()

export const documentProcessingWorkerResponseSchema = z
  .object({
    schema_version: z.literal(1),
    job_id: z.string().uuid(),
    attempt: z.number().int().min(1).max(DOCUMENT_PROCESSING_MAX_ATTEMPTS),
    source_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    producer: z
      .object({
        name: z.string().trim().min(1).max(100),
        version: z.string().trim().min(1).max(100),
      })
      .strict(),
    source_format: z.enum(['dxf', 'dwg']),
    parsed_format: z.enum(['dxf', 'dwg']),
    items: z
      .array(documentProcessingWorkerEvidenceItemSchema)
      .max(DOCUMENT_PROCESSING_MAX_ITEMS),
    warnings: z
      .array(z.string().max(500))
      .max(DOCUMENT_PROCESSING_MAX_WARNINGS),
  })
  .strict()

export type DocumentProcessingRequest = z.infer<
  typeof documentProcessingRequestSchema
>
export type DocumentProcessingQueueJob = z.infer<
  typeof documentProcessingQueueJobSchema
>
export type DocumentProcessingStatus = z.infer<
  typeof documentProcessingStatusSchema
>
export type DocumentProcessingAccepted = z.infer<
  typeof documentProcessingAcceptedSchema
>
export type DocumentProcessingWorkerRequest = z.infer<
  typeof documentProcessingWorkerRequestSchema
>
export type DocumentProcessingWorkerEvidenceItem = z.infer<
  typeof documentProcessingWorkerEvidenceItemSchema
>
export type DocumentProcessingWorkerResponse = z.infer<
  typeof documentProcessingWorkerResponseSchema
>
