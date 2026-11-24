import { z } from 'zod'
import { isoDateTimeString } from '../iso-datetime'

export const costCategoryValues = [
  'material',
  'labour',
  'subcontractor',
  'equipment',
  'overhead',
  'other',
] as const

export const createCostEntryCommandSchema = z
  .object({
    costCodeId: z.string().guid(),
    costCategory: z.enum(costCategoryValues),
    description: z.string().trim().min(1).max(500),
    amountCents: z.number().int().positive().max(100_000_000_000),
    quantity: z.number().int().min(1).max(1_000_000).default(1),
    unit: z.string().trim().max(20).nullable().default(null),
    incurredAt: isoDateTimeString({ offset: true }).nullable().default(null),
    referenceNumber: z.string().trim().max(100).nullable().default(null),
    notes: z.string().trim().max(1_000).nullable().default(null),
  })
  .strict()

export const costEntryCreationResultSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().guid(),
  projectId: z.string().guid(),
  costCodeId: z.string().guid(),
  costCategory: z.enum(costCategoryValues),
  costSource: z.literal('manual'),
  description: z.string(),
  amountCents: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unit: z.string().nullable(),
  incurredAt: isoDateTimeString({ offset: true }),
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoDateTimeString({ offset: true }),
})

export const deleteCostEntryBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const deleteCostEntryCommandSchema = z
  .object({
    projectId: z.string().guid(),
    costEntryId: z.string().guid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const costEntryDeletionResultSchema = z
  .object({
    costEntryId: z.string().guid(),
    tenantId: z.string().guid(),
    projectId: z.string().guid(),
    costSource: z.literal('manual'),
    status: z.literal('voided'),
    voidedAt: isoDateTimeString({ offset: true }),
    restorable: z.literal(true),
  })
  .strict()

export const restoreCostEntryBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const restoreCostEntryCommandSchema = z
  .object({
    projectId: z.string().guid(),
    costEntryId: z.string().guid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()

export const costEntryRestoreResultSchema = z
  .object({
    costEntryId: z.string().guid(),
    tenantId: z.string().guid(),
    projectId: z.string().guid(),
    costSource: z.literal('manual'),
    status: z.literal('restored'),
    restoredAt: isoDateTimeString({ offset: true }),
    restorable: z.literal(false),
  })
  .strict()

export type CreateCostEntryCommand = z.infer<typeof createCostEntryCommandSchema>
export type CostEntryCreationResult = z.infer<
  typeof costEntryCreationResultSchema
>
export type DeleteCostEntryBody = z.infer<typeof deleteCostEntryBodySchema>
export type DeleteCostEntryCommand = z.infer<typeof deleteCostEntryCommandSchema>
export type CostEntryDeletionResult = z.infer<
  typeof costEntryDeletionResultSchema
>
export type RestoreCostEntryBody = z.infer<typeof restoreCostEntryBodySchema>
export type RestoreCostEntryCommand = z.infer<
  typeof restoreCostEntryCommandSchema
>
export type CostEntryRestoreResult = z.infer<
  typeof costEntryRestoreResultSchema
>
