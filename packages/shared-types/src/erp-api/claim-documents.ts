import { z } from 'zod'

const uuid = z.string().uuid().transform((value) => value.toLowerCase())

export const claimDocumentAttachCommandSchema = z.object({
  clientRequestId: uuid,
  documentId: uuid,
  kind: z.enum(['photo', 'certificate', 'measurement', 'other']),
  caption: z.string().trim().max(255).nullish().transform((value) => value || null),
}).strict()

export const claimDocumentAttachResultSchema = z.object({
  attachmentId: uuid,
  tenantId: uuid,
  projectId: uuid,
  claimId: uuid,
  documentId: uuid,
  changed: z.boolean(),
}).strict()

export type ClaimDocumentAttachCommand = z.infer<typeof claimDocumentAttachCommandSchema>
export type ClaimDocumentAttachResult = z.infer<typeof claimDocumentAttachResultSchema>
