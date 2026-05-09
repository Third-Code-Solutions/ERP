import { z } from 'zod'

export const bomStatusValues = ['draft', 'approved', 'locked', 'archived'] as const
export type BomStatus = typeof bomStatusValues[number]

export const createBomSchema = z.object({
  project_id: z.string().uuid(),
  opportunity_id: z.string().uuid().optional(),
  label: z.string().max(255).optional(),
  notes: z.string().max(5000).optional(),
})

export const createBomLineItemSchema = z.object({
  bom_id: z.string().uuid(),
  parent_id: z.string().uuid().optional(),
  sort_order: z.number().int().min(0).default(0),
  is_group: z.boolean().default(false),
  code: z.string().max(50).optional(),
  description: z.string().min(1).max(1000),
  unit: z.string().max(20).optional(),
  quantity: z.number().int().min(0).default(0),
  unit_cost_cents: z.number().int().min(0).default(0),
  markup_bps: z.number().int().min(0).max(10000).default(0),
  notes: z.string().max(2000).optional(),
})

export const updateBomLineItemSchema = createBomLineItemSchema.partial().omit({ bom_id: true })

export type CreateBomInput = z.infer<typeof createBomSchema>
export type CreateBomLineItemInput = z.infer<typeof createBomLineItemSchema>
export type UpdateBomLineItemInput = z.infer<typeof updateBomLineItemSchema>
