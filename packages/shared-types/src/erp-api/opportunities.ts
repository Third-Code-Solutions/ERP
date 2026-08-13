import { z } from 'zod'
import { opportunityStageValues } from '../opportunities'

export const opportunityInspectionStatusValues = [
  'draft',
  'submitted',
  'archived',
] as const

export const opportunityDetailOpportunitySchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    stage: z.enum(opportunityStageValues),
    tcvCents: z.number().int(),
    gpCents: z.number().int(),
    probability: z.number().int().min(0).max(100),
    weightedTcvCents: z.number().int(),
    areaSqm: z.number().int().nonnegative().nullable(),
    opportunityType: z.string().nullable(),
    closingDate: z.string().datetime({ offset: true }).nullable(),
    accountId: z.string().uuid().nullable(),
    projectId: z.string().uuid().nullable(),
    accountName: z.string().nullable(),
    projectName: z.string().nullable(),
  })
  .strict()

export type OpportunityDetailOpportunity = z.infer<
  typeof opportunityDetailOpportunitySchema
>

export const opportunityInspectionSummarySchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(opportunityInspectionStatusValues),
  })
  .strict()

export type OpportunityInspectionSummary = z.infer<
  typeof opportunityInspectionSummarySchema
>

export const opportunityDetailProgressSchema = z
  .object({
    latestPprfVersion: z.number().int().positive().nullable(),
    latestInspection: opportunityInspectionSummarySchema.nullable(),
    designCount: z.number().int().nonnegative(),
    approvedDesignCount: z.number().int().nonnegative(),
    openChangeRequestCount: z.number().int().nonnegative(),
  })
  .strict()

export type OpportunityDetailProgress = z.infer<
  typeof opportunityDetailProgressSchema
>

export const opportunityDetailResultSchema = z
  .object({
    opportunity: opportunityDetailOpportunitySchema,
    progress: opportunityDetailProgressSchema,
  })
  .strict()

export type OpportunityDetailResult = z.infer<
  typeof opportunityDetailResultSchema
>
