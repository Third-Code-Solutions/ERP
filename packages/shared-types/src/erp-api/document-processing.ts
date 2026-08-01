import { z } from 'zod'

export const DOCUMENT_PROCESSING_MAX_WARNINGS = 100
export const DOCUMENT_PROCESSING_MAX_FAILURE_CODE = 100

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
