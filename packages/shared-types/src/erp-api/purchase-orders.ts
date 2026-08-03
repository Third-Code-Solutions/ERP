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

export const createPurchaseOrderFromBomCommandSchema = z
  .object({
    bomId: z.string().uuid(),
    projectId: z.string().uuid(),
    vendorId: z.string().uuid().nullable().optional(),
    deliveryDate: z.string().datetime({ offset: true }).nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()

export const purchaseOrderBomCreationResultSchema = z
  .object({
    purchaseOrderId: z.string().uuid(),
    tenantId: z.string().uuid(),
    bomId: z.string().uuid(),
    poNumber: z.string().min(1).max(50),
    status: z.literal('draft'),
  })
  .strict()

const purchaseOrderSupplierGroupSchema = z
  .object({
    vendorId: z.string().uuid().nullable(),
    vendorName: z.string().min(1).max(255),
    lineCount: z.number().int().positive().max(500),
    subtotalCents: z.number().int().nonnegative().safe(),
  })
  .strict()

export const createPurchaseOrdersGroupedFromBomCommandSchema = z
  .object({
    bomId: z.string().uuid(),
  })
  .strict()

export const purchaseOrdersGroupedFromBomResultSchema = z
  .object({
    tenantId: z.string().uuid(),
    bomId: z.string().uuid(),
    purchaseOrderIds: z.array(z.string().uuid()).max(500),
    groups: z.array(purchaseOrderSupplierGroupSchema).max(500),
  })
  .strict()

export type CreatePurchaseOrderCommand = z.infer<
  typeof createPurchaseOrderCommandSchema
>
export type PurchaseOrderCreationResult = z.infer<
  typeof purchaseOrderCreationResultSchema
>
export type CreatePurchaseOrderFromBomCommand = z.infer<
  typeof createPurchaseOrderFromBomCommandSchema
>
export type PurchaseOrderBomCreationResult = z.infer<
  typeof purchaseOrderBomCreationResultSchema
>
export type CreatePurchaseOrdersGroupedFromBomCommand = z.infer<
  typeof createPurchaseOrdersGroupedFromBomCommandSchema
>
export type PurchaseOrdersGroupedFromBomResult = z.infer<
  typeof purchaseOrdersGroupedFromBomResultSchema
>

export const purchaseOrderWorkflowActionSchema = z.enum([
  'submit_pm_approval',
  'pm_approve',
  'commercial_approve',
  'reject',
  'scm_issue',
])

export const purchaseOrderWorkflowCommandSchema = z
  .object({
    action: purchaseOrderWorkflowActionSchema,
    reason: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.action === 'reject' && !command.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Rejection reason is required',
      })
    }
    if (command.action !== 'reject' && command.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Reason is only accepted when rejecting a Purchase Order',
      })
    }
  })

export const purchaseOrderWorkflowStatusSchema = z.enum([
  'draft',
  'pending_pm_approval',
  'pending_commercial_approval',
  'pending_scm_issuance',
  'issued',
  'partial_delivered',
  'fully_delivered',
  'submitted',
  'confirmed',
  'partial_delivery',
  'delivered',
  'cancelled',
])

export const purchaseOrderWorkflowResultSchema = z
  .object({
    purchaseOrderId: z.string().uuid(),
    tenantId: z.string().uuid(),
    action: purchaseOrderWorkflowActionSchema,
    fromStatus: purchaseOrderWorkflowStatusSchema,
    status: purchaseOrderWorkflowStatusSchema,
  })
  .strict()

export const purchaseOrderSupplierIssuedPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    purchase_order_id: z.string().uuid(),
    // Source-only session association. The raw public token is never placed
    // in an outbox payload; the email path remains unchanged until link
    // delivery is explicitly enabled in a later slice.
    vendor_confirmation_session_id: z.string().uuid().nullable().optional(),
  })
  .strict()

export type PurchaseOrderWorkflowAction = z.infer<
  typeof purchaseOrderWorkflowActionSchema
>
export type PurchaseOrderWorkflowStatus = z.infer<
  typeof purchaseOrderWorkflowStatusSchema
>
export type PurchaseOrderWorkflowCommand = z.infer<
  typeof purchaseOrderWorkflowCommandSchema
>
export type PurchaseOrderWorkflowResult = z.infer<
  typeof purchaseOrderWorkflowResultSchema
>
export type PurchaseOrderSupplierIssuedPayload = z.infer<
  typeof purchaseOrderSupplierIssuedPayloadSchema
>
