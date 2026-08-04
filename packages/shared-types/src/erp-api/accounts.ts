import { z } from 'zod'
import { accountIndustryValues, kycStatusValues } from '../accounts'

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
