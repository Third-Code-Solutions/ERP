import { z } from 'zod'

const MAX_POSTGRES_INTEGER = 2_147_483_647
const MAX_SAFE_CENTAVOS = Number.MAX_SAFE_INTEGER

const uuidSchema = z.string().uuid()

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO calendar date')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Expected a valid calendar date')

const safeCentavoSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_SAFE_CENTAVOS)

const quantitySchema = z
  .number()
  .int()
  .positive()
  .max(MAX_POSTGRES_INTEGER)

export const createPoFromBomInputSchema = z.object({
  bomId: uuidSchema,
  projectId: uuidSchema,
  vendorId: uuidSchema.nullable(),
  deliveryDate: dateOnlySchema.nullable(),
})

export const createGroupedPoFromBomInputSchema = z.object({
  bomId: uuidSchema,
})

export const purchaseOrderLineItemInputSchema = z
  .object({
    description: z.string().trim().min(1).max(2_000),
    code: z.string().trim().max(50).optional(),
    unit: z.string().trim().max(20).optional(),
    quantity: quantitySchema,
    unit_cost_cents: safeCentavoSchema,
    costCodeId: uuidSchema,
  })
  .strict()

export const standalonePurchaseOrderInputSchema = z.object({
  projectId: uuidSchema,
  vendorId: uuidSchema.nullable(),
  deliveryDate: dateOnlySchema.nullable(),
  notes: z.string().trim().max(10_000).optional(),
  lineItems: z.array(purchaseOrderLineItemInputSchema).min(1).max(500),
})

export type PurchaseOrderLineItemInput = z.infer<
  typeof purchaseOrderLineItemInputSchema
>
