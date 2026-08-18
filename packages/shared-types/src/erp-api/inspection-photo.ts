import { z } from 'zod'

export const inspectionPhotoMimeTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
])

/**
 * Storage is uploaded before this command. Core validates the exact tenant and
 * opportunity prefix before it records the image evidence and audit event.
 */
export const inspectionPhotoCommandSchema = z
  .object({
    opportunityId: z.string().uuid(),
    storagePath: z.string().trim().min(1).max(2_000),
    fileName: z.string().trim().min(1).max(255),
    mimeType: inspectionPhotoMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(15 * 1024 * 1024),
    caption: z.string().trim().max(255).nullable().default(null),
  })
  .strict()

export const inspectionPhotoResultSchema = z
  .object({
    documentId: z.string().uuid(),
    tenantId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    projectId: z.string().uuid().nullable(),
    storagePath: z.string().trim().min(1).max(2_000),
    fileName: z.string().trim().min(1).max(255),
    status: z.literal('created'),
  })
  .strict()

export type InspectionPhotoCommand = z.infer<
  typeof inspectionPhotoCommandSchema
>
export type InspectionPhotoResult = z.infer<
  typeof inspectionPhotoResultSchema
>
