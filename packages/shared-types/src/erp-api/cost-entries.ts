import { z } from 'zod'

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
    costCodeId: z.string().uuid(),
    costCategory: z.enum(costCategoryValues),
    description: z.string().trim().min(1).max(500),
    amountCents: z.number().int().positive().max(100_000_000_000),
    quantity: z.number().int().min(1).max(1_000_000).default(1),
    unit: z.string().trim().max(20).nullable().default(null),
    incurredAt: z.string().datetime({ offset: true }).nullable().default(null),
    referenceNumber: z.string().trim().max(100).nullable().default(null),
    notes: z.string().trim().max(1_000).nullable().default(null),
  })
  .strict()

export const costEntryCreationResultSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  costCodeId: z.string().uuid(),
  costCategory: z.enum(costCategoryValues),
  costSource: z.literal('manual'),
  description: z.string(),
  amountCents: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unit: z.string().nullable(),
  incurredAt: z.string().datetime({ offset: true }),
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
})

export type CreateCostEntryCommand = z.infer<typeof createCostEntryCommandSchema>
export type CostEntryCreationResult = z.infer<
  typeof costEntryCreationResultSchema
>
