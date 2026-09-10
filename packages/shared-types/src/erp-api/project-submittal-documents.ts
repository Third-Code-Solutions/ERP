import { z } from 'zod'
import { documentIntakeDocumentTypeSchema } from './document-intake'

const text = (max: number) => z.string().trim().max(max).default('')

export const projectSubmittalDocumentRoleSchema = z.enum([
  'submission',
  'plan',
  'response',
])

export const projectDocumentListQuerySchema = z
  .object({
    documentType: documentIntakeDocumentTypeSchema.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()

export const projectDocumentRowSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    fileName: z.string().trim().min(1).max(255),
    documentType: documentIntakeDocumentTypeSchema,
    mimeType: z.string().trim().min(1).max(127),
    sizeBytes: z.number().int().nonnegative(),
    description: z.string().max(2000).nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const projectDocumentListResultSchema = z
  .object({
    projectId: z.string().uuid(),
    rows: z.array(projectDocumentRowSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().min(1).max(100),
    totalPages: z.number().int().positive(),
  })
  .strict()

export const projectSubmittalDocumentLinkCommandSchema = z
  .object({
    documentId: z.string().uuid(),
    role: projectSubmittalDocumentRoleSchema,
    caption: text(255),
    expectedVersion: z.number().int().min(1),
    clientRequestId: z.string().uuid(),
  })
  .strict()

export const projectSubmittalDocumentUnlinkCommandSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
  })
  .strict()

export const projectSubmittalDocumentLinkRowSchema = z
  .object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    submittalId: z.string().uuid(),
    documentId: z.string().uuid(),
    role: projectSubmittalDocumentRoleSchema,
    caption: z.string().max(255),
    fileName: z.string().trim().min(1).max(255),
    documentType: documentIntakeDocumentTypeSchema,
    mimeType: z.string().trim().min(1).max(127),
    sizeBytes: z.number().int().nonnegative(),
    description: z.string().max(2000).nullable(),
    linkedBy: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const projectSubmittalDocumentListResultSchema = z
  .object({
    projectId: z.string().uuid(),
    submittalId: z.string().uuid(),
    rows: z.array(projectSubmittalDocumentLinkRowSchema),
  })
  .strict()

export const projectSubmittalDocumentLinkResultSchema = z
  .object({
    projectId: z.string().uuid(),
    submittalId: z.string().uuid(),
    changed: z.boolean(),
    submittalVersion: z.number().int().min(1),
    link: projectSubmittalDocumentLinkRowSchema,
  })
  .strict()

export const projectSubmittalDocumentUnlinkResultSchema = z
  .object({
    projectId: z.string().uuid(),
    submittalId: z.string().uuid(),
    changed: z.boolean(),
    submittalVersion: z.number().int().min(1),
    linkId: z.string().uuid(),
  })
  .strict()

export type ProjectSubmittalDocumentRole = z.infer<
  typeof projectSubmittalDocumentRoleSchema
>
export type ProjectDocumentListQuery = z.infer<
  typeof projectDocumentListQuerySchema
>
export type ProjectDocumentRow = z.infer<typeof projectDocumentRowSchema>
export type ProjectDocumentListResult = z.infer<
  typeof projectDocumentListResultSchema
>
export type ProjectSubmittalDocumentLinkCommand = z.infer<
  typeof projectSubmittalDocumentLinkCommandSchema
>
export type ProjectSubmittalDocumentUnlinkCommand = z.infer<
  typeof projectSubmittalDocumentUnlinkCommandSchema
>
export type ProjectSubmittalDocumentLinkRow = z.infer<
  typeof projectSubmittalDocumentLinkRowSchema
>
export type ProjectSubmittalDocumentListResult = z.infer<
  typeof projectSubmittalDocumentListResultSchema
>
export type ProjectSubmittalDocumentLinkResult = z.infer<
  typeof projectSubmittalDocumentLinkResultSchema
>
export type ProjectSubmittalDocumentUnlinkResult = z.infer<
  typeof projectSubmittalDocumentUnlinkResultSchema
>
