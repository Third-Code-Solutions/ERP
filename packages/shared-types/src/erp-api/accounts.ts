import { z } from 'zod'
import { isoDateTimeString } from '../iso-datetime'
import {
  accountIndustryValues,
  kycArtifactTypeValues,
  kycStatusValues,
} from '../accounts'
import { opportunityStageValues } from '../opportunities'
import { projectStatusValues } from '../projects'

export const accountListSortValues = [
  'created_at',
  'name',
  'kyc_status',
] as const

export const accountListQuerySchema = z
  .object({
    q: z.string().trim().max(255).optional(),
    industry: z.enum(accountIndustryValues).optional(),
    kycStatus: z.enum(kycStatusValues).optional(),
    sort: z.enum(accountListSortValues).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()

export type AccountListQuery = z.infer<typeof accountListQuerySchema>

export const accountReadResultSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().guid(),
  name: z.string(),
  industry: z.enum(accountIndustryValues),
  billingAddress: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  kycStatus: z.enum(kycStatusValues),
  createdAt: isoDateTimeString({ offset: true }),
  updatedAt: isoDateTimeString({ offset: true }),
  createdBy: z.string().guid().nullable(),
  opportunityCount: z.number().int().nonnegative(),
})

export type AccountReadResult = z.infer<typeof accountReadResultSchema>

export const accountListResultSchema = z.object({
  rows: z.array(accountReadResultSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().min(1),
})

export type AccountListResult = z.infer<typeof accountListResultSchema>

export const accountKycQueueRowSchema = z
  .object({
    id: z.string().guid(),
    tenantId: z.string().guid(),
    name: z.string(),
    industry: z.enum(accountIndustryValues),
    createdAt: isoDateTimeString({ offset: true }),
    artifactCount: z.number().int().nonnegative(),
  })
  .strict()

export type AccountKycQueueRow = z.infer<typeof accountKycQueueRowSchema>

export const accountKycQueueResultSchema = z
  .object({
    rows: z.array(accountKycQueueRowSchema),
    total: z.number().int().nonnegative(),
    limit: z.literal(200),
    truncated: z.boolean(),
  })
  .strict()

export type AccountKycQueueResult = z.infer<
  typeof accountKycQueueResultSchema
>

export const accountDetailAccountSchema = accountReadResultSchema.extend({
  kycNotes: z.string().nullable(),
  kycDecidedAt: isoDateTimeString({ offset: true }).nullable(),
  kycDecidedBy: z.string().guid().nullable(),
  cnpsScoreX10: z.string().nullable(),
})

export type AccountDetailAccount = z.infer<typeof accountDetailAccountSchema>

export const accountContactReadSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().guid(),
  accountId: z.string().guid(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roleTitle: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: isoDateTimeString({ offset: true }),
  updatedAt: isoDateTimeString({ offset: true }),
})

export type AccountContactRead = z.infer<typeof accountContactReadSchema>

export const accountKycArtifactReadSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().guid(),
  accountId: z.string().guid(),
  artifactType: z.enum(kycArtifactTypeValues),
  documentId: z.string().guid().nullable(),
  notes: z.string().nullable(),
  uploadedAt: isoDateTimeString({ offset: true }),
  fileName: z.string().nullable(),
})

export type AccountKycArtifactRead = z.infer<typeof accountKycArtifactReadSchema>

export const accountOpportunityReadSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().guid(),
  accountId: z.string().guid().nullable(),
  projectId: z.string().guid().nullable(),
  stage: z.enum(opportunityStageValues),
  tcvCents: z.number().int(),
  gpCents: z.number().int(),
  probability: z.number().int().min(0).max(100),
  weightedTcvCents: z.number().int(),
  areaSqm: z.number().int().nonnegative().nullable(),
  opportunityType: z.string().nullable(),
  closingDate: isoDateTimeString({ offset: true }).nullable(),
  createdAt: isoDateTimeString({ offset: true }),
  updatedAt: isoDateTimeString({ offset: true }),
})

export type AccountOpportunityRead = z.infer<typeof accountOpportunityReadSchema>

export const accountProjectReadSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().guid(),
  accountId: z.string().guid().nullable(),
  name: z.string(),
  status: z.enum(projectStatusValues),
  createdAt: isoDateTimeString({ offset: true }),
  updatedAt: isoDateTimeString({ offset: true }),
})

export type AccountProjectRead = z.infer<typeof accountProjectReadSchema>

export const accountDetailResultSchema = z.object({
  account: accountDetailAccountSchema,
  contacts: z.array(accountContactReadSchema),
  kycArtifacts: z.array(accountKycArtifactReadSchema),
  opportunities: z.array(accountOpportunityReadSchema),
  projects: z.array(accountProjectReadSchema),
})

export type AccountDetailResult = z.infer<typeof accountDetailResultSchema>
