import { z } from 'zod'
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
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  industry: z.enum(accountIndustryValues),
  billingAddress: z.string().nullable(),
  primaryEmail: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  kycStatus: z.enum(kycStatusValues),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  createdBy: z.string().uuid().nullable(),
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

export const accountDetailAccountSchema = accountReadResultSchema.extend({
  kycNotes: z.string().nullable(),
  kycDecidedAt: z.string().datetime({ offset: true }).nullable(),
  kycDecidedBy: z.string().uuid().nullable(),
  cnpsScoreX10: z.string().nullable(),
})

export type AccountDetailAccount = z.infer<typeof accountDetailAccountSchema>

export const accountContactReadSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  accountId: z.string().uuid(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roleTitle: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export type AccountContactRead = z.infer<typeof accountContactReadSchema>

export const accountKycArtifactReadSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  accountId: z.string().uuid(),
  artifactType: z.enum(kycArtifactTypeValues),
  documentId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  uploadedAt: z.string().datetime({ offset: true }),
  fileName: z.string().nullable(),
})

export type AccountKycArtifactRead = z.infer<typeof accountKycArtifactReadSchema>

export const accountOpportunityReadSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  stage: z.enum(opportunityStageValues),
  tcvCents: z.number().int(),
  gpCents: z.number().int(),
  probability: z.number().int().min(0).max(100),
  weightedTcvCents: z.number().int(),
  areaSqm: z.number().int().nonnegative().nullable(),
  opportunityType: z.string().nullable(),
  closingDate: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export type AccountOpportunityRead = z.infer<typeof accountOpportunityReadSchema>

export const accountProjectReadSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  name: z.string(),
  status: z.enum(projectStatusValues),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
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
