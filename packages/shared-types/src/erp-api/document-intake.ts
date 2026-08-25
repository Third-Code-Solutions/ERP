import { z } from 'zod'

/**
 * Server-authorized document intake. Storage objects are uploaded before this
 * command; Nest records the canonical document row and audit event.
 */
export const documentIntakeDocumentTypeSchema = z.enum([
  'dxf',
  'pdf',
  'image',
  'contract',
  'bom',
  'invoice',
  'po',
  'other',
])

export const documentIntakeRequestSchema = z
  .object({
    storagePath: z.string().trim().min(1).max(2_000),
    projectId: z.string().uuid(),
    opportunityId: z.string().uuid().optional(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z
      .string()
      .trim()
      .min(1)
      .max(127)
      .default('application/octet-stream'),
    sizeBytes: z.number().int().nonnegative().max(100 * 1024 * 1024),
    description: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()

export const documentIntakeResultSchema = z
  .object({
    documentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    storagePath: z.string().trim().min(1).max(2_000),
    documentType: documentIntakeDocumentTypeSchema,
    status: z.literal('created'),
    created: z.boolean(),
  })
  .strict()

export type DocumentIntakeRequest = z.infer<typeof documentIntakeRequestSchema>
export type DocumentIntakeResult = z.infer<typeof documentIntakeResultSchema>
export type DocumentIntakeDocumentType = z.infer<
  typeof documentIntakeDocumentTypeSchema
>
