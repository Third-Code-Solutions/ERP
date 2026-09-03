import { z } from 'zod'
import { opportunityStageValues } from '../opportunities'

const MAX_SAFE_CENTAVOS = BigInt(Number.MAX_SAFE_INTEGER)

export const safeNonNegativeCentavosStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'Expected canonical non-negative centavos')
  .refine((value) => BigInt(value) <= MAX_SAFE_CENTAVOS, {
    message: 'Centavos exceed the current exact persistence range',
  })

export const safeSignedCentavosStringSchema = z
  .string()
  .regex(/^(0|-?[1-9]\d*)$/, 'Expected canonical signed centavos')
  .refine((value) => {
    const amount = BigInt(value)
    return amount >= -MAX_SAFE_CENTAVOS && amount <= MAX_SAFE_CENTAVOS
  }, {
    message: 'Centavos exceed the current exact persistence range',
  })

/** Project-detail Opportunity creation; Account identity is server-derived. */
export const opportunityCreationCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    stage: z.literal('opportunity_creation').default('opportunity_creation'),
    tcvCents: safeNonNegativeCentavosStringSchema.default('0'),
    gpCents: safeSignedCentavosStringSchema.default('0'),
    closingDate: z.string().datetime({ offset: true }).optional(),
    areaSqm: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    opportunityType: z.string().trim().min(1).max(100).optional(),
    remarks: z.string().trim().min(1).max(5000).optional(),
  })
  .strict()

export const opportunityCreationResultSchema = z
  .object({
    ok: z.literal(true),
    opportunityId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    accountId: z.string().uuid().nullable(),
    repId: z.string().uuid(),
    stage: z.literal('opportunity_creation'),
    probability: z.literal(10),
    tcvCents: safeNonNegativeCentavosStringSchema,
    gpCents: safeSignedCentavosStringSchema,
    weightedTcvCents: safeNonNegativeCentavosStringSchema,
    closingDate: z.string().datetime({ offset: true }).nullable(),
    areaSqm: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    opportunityType: z.string().max(100).nullable(),
    remarks: z.string().max(5000).nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type OpportunityCreationCommand = z.infer<
  typeof opportunityCreationCommandSchema
>
export type OpportunityCreationResult = z.infer<
  typeof opportunityCreationResultSchema
>

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
