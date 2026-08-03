import { z } from 'zod'

const vendorConfirmationDecisionSchema = z.enum([
  'accepted',
  'declined',
  'changes_requested',
])

/** The public response body never carries tenant, vendor, PO, or actor IDs. */
export const vendorConfirmationBodySchema = z
  .object({
    decision: vendorConfirmationDecisionSchema,
    responderName: z.string().trim().min(1).max(255),
    responderEmail: z.string().trim().email().max(255).nullable().optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.decision !== 'accepted' && !body.note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A note is required when declining or requesting changes',
      })
    }
  })

export const vendorConfirmationCommandSchema = z
  .object({
    token: z.string().regex(/^[0-9a-f]{64}$/i),
    decision: vendorConfirmationDecisionSchema,
    responderName: z.string().trim().min(1).max(255),
    responderEmail: z.string().trim().email().max(255).nullable().optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.decision !== 'accepted' && !command.note) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A note is required when declining or requesting changes',
      })
    }
  })

export const vendorConfirmationResultSchema = z
  .object({
    sessionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    purchaseOrderId: z.string().uuid(),
    vendorId: z.string().uuid(),
    decision: vendorConfirmationDecisionSchema,
    respondedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type VendorConfirmationDecision = z.infer<
  typeof vendorConfirmationDecisionSchema
>
export type VendorConfirmationBody = z.infer<
  typeof vendorConfirmationBodySchema
>
export type VendorConfirmationCommand = z.infer<
  typeof vendorConfirmationCommandSchema
>
export type VendorConfirmationResult = z.infer<
  typeof vendorConfirmationResultSchema
>
