import { z } from 'zod'

const purchaseOrderLineSchema = z
  .object({
    code: z.string().trim().max(50).optional(),
    description: z.string().trim().min(1).max(2_000),
    unit: z.string().trim().max(20).optional(),
    quantity: z.number().int().positive().max(2_147_483_647),
    unitCostCents: z.number().int().nonnegative().safe(),
    costCodeId: z.string().uuid(),
  })
  .strict()

export const createPurchaseOrderCommandSchema = z
  .object({
    projectId: z.string().uuid(),
    vendorId: z.string().uuid().nullable().optional(),
    deliveryDate: z.string().datetime({ offset: true }).nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
    lines: z.array(purchaseOrderLineSchema).min(1).max(500),
  })
  .strict()

export const purchaseOrderCreationResultSchema = z
  .object({
    purchaseOrderId: z.string().uuid(),
    tenantId: z.string().uuid(),
    poNumber: z.string().min(1).max(50),
    status: z.literal('draft'),
  })
  .strict()

export type CreatePurchaseOrderCommand = z.infer<
  typeof createPurchaseOrderCommandSchema
>
export type PurchaseOrderCreationResult = z.infer<
  typeof purchaseOrderCreationResultSchema
>
