import { z } from 'zod'
import { kycArtifactTypeValues } from '../accounts'

const uuid = z.string().uuid().transform((value) => value.toLowerCase())

export const kycArtifactCreateCommandSchema = z.object({
  clientRequestId: uuid,
  artifactType: z.enum(kycArtifactTypeValues),
  documentId: uuid.nullish().transform((value) => value ?? null),
  notes: z.string().trim().max(2000).nullish().transform((value) => value || null),
}).strict()

export const kycArtifactCreateResultSchema = z.object({
  artifactId: uuid, accountId: uuid, tenantId: uuid,
  documentId: uuid.nullable(), changed: z.boolean(),
}).strict()

export const accountKycDocumentQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  selectedDocumentId: uuid.optional(),
}).strict()

export const accountKycDocumentRowSchema = z.object({
  documentId: uuid, tenantId: uuid, accountId: uuid,
  fileName: z.string(), documentType: z.string(), mimeType: z.string(),
  createdAt: z.string().datetime(),
  projectId: uuid.nullable(), projectName: z.string().nullable(),
  opportunityId: uuid.nullable(), opportunityStage: z.string().nullable(),
  opportunityType: z.string().nullable(),
}).strict()

export const accountKycDocumentResultSchema = z.object({
  accountId: uuid, tenantId: uuid,
  rows: z.array(accountKycDocumentRowSchema).max(50),
  selectedDocument: accountKycDocumentRowSchema.nullable(),
  page: z.number().int().positive(), limit: z.number().int().min(1).max(50),
  total: z.number().int().nonnegative(), totalPages: z.number().int().positive(),
}).strict()

export type KycArtifactCreateCommand = z.infer<typeof kycArtifactCreateCommandSchema>
export type KycArtifactCreateResult = z.infer<typeof kycArtifactCreateResultSchema>
export type AccountKycDocumentQuery = z.infer<typeof accountKycDocumentQuerySchema>
export type AccountKycDocumentRow = z.infer<typeof accountKycDocumentRowSchema>
export type AccountKycDocumentResult = z.infer<typeof accountKycDocumentResultSchema>
