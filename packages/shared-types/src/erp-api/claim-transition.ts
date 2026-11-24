import { z } from 'zod'
import { formatCents } from '../common'

export const claimTransitionStatusSchema = z.enum([
  'draft',
  'submitted',
  'certificate_pending',
  'certified',
  'handed_over_finance',
  'invoiced',
  'paid',
  'rejected',
  'cancelled',
])

export const claimTransitionActionSchema = z.enum([
  'submit',
  'certificate_pending',
  'certify',
  'handover',
  'link_invoice',
  'record_payment',
  'reject',
  'cancel',
])

const uuid = z.string().guid().transform((value) => value.toLowerCase())
const reason = z.string().trim().min(3).max(2000)

const commandFields = {
  clientRequestId: uuid,
}

export const claimTransitionCommandSchema = z.discriminatedUnion('action', [
  z.object({ ...commandFields, action: z.literal('submit') }).strict(),
  z.object({ ...commandFields, action: z.literal('certificate_pending') }).strict(),
  z.object({
    ...commandFields,
    action: z.literal('certify'),
    certificateDocumentId: uuid,
  }).strict(),
  z.object({ ...commandFields, action: z.literal('handover') }).strict(),
  z.object({
    ...commandFields,
    action: z.literal('link_invoice'),
    invoiceId: uuid,
  }).strict(),
  z.object({ ...commandFields, action: z.literal('record_payment') }).strict(),
  z.object({ ...commandFields, action: z.literal('reject'), reason }).strict(),
  z.object({ ...commandFields, action: z.literal('cancel'), reason }).strict(),
])

export const claimTransitionCommandReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.literal('transition'),
  tenantId: uuid,
  actorId: uuid,
  claimId: uuid,
  projectId: uuid,
  clientRequestId: uuid,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  action: claimTransitionActionSchema,
  fromStatus: claimTransitionStatusSchema,
  toStatus: claimTransitionStatusSchema,
  changedAt: z.string().datetime({ offset: true }),
}).strict()

export const claimTransitionResultSchema = z.object({
  claimId: uuid,
  changed: z.boolean(),
  receipt: claimTransitionCommandReceiptSchema,
}).strict()

export type ClaimTransitionStatus = z.infer<typeof claimTransitionStatusSchema>
export type ClaimTransitionCommand = z.infer<typeof claimTransitionCommandSchema>
export type ClaimTransitionCommandReceipt = z.infer<typeof claimTransitionCommandReceiptSchema>
export type ClaimTransitionResult = z.infer<typeof claimTransitionResultSchema>

/** Stable semantic serialization shared by Core hashing and Web validation. */
export function claimTransitionPayload(
  claimId: string,
  command: ClaimTransitionCommand,
): string {
  const parsedClaimId = uuid.parse(claimId)
  const parsed = claimTransitionCommandSchema.parse(command)
  const payload: Record<string, unknown> = {
    operation: 'transition',
    claimId: parsedClaimId,
    action: parsed.action,
  }
  if ('certificateDocumentId' in parsed) payload.certificateDocumentId = parsed.certificateDocumentId
  if ('invoiceId' in parsed) payload.invoiceId = parsed.invoiceId
  if ('reason' in parsed) payload.reason = parsed.reason
  return JSON.stringify(payload)
}

/** Values of the invoice_status enum. */
export type InvoiceStatus = 'draft' | 'issued' | 'partial_payment' | 'paid' | 'overdue' | 'cancelled'

/** Invoice statuses a claim may link to. Reversal sets status to cancelled and stamps reversed_at. */
export const CLAIM_LINKABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = ['issued', 'partial_payment', 'paid', 'overdue']

/** Invoice statuses with at least one posted customer receipt; a claim payment needs one of them. */
export const CLAIM_PAYABLE_INVOICE_STATUSES: readonly InvoiceStatus[] = ['partial_payment', 'paid']

/** Claim statuses that release their invoice. Mirrors the partial unique index ux_progress_claims_tenant_invoice_live. */
export const RELEASED_CLAIM_STATUSES: readonly ClaimTransitionStatus[] = ['rejected', 'cancelled']

export function isClaimLinkableInvoiceStatus(status: string): boolean {
  return (CLAIM_LINKABLE_INVOICE_STATUSES as readonly string[]).includes(status)
}

export function isClaimPayableInvoiceStatus(status: string): boolean {
  return (CLAIM_PAYABLE_INVOICE_STATUSES as readonly string[]).includes(status)
}

/** Null when the claim amount and the invoice subtotal agree to the centavo. Core and Web show this same text. */
export function claimInvoiceAmountMismatch(
  claimAmountCents: number,
  invoiceSubtotalCents: number,
): string | null {
  if (claimAmountCents === invoiceSubtotalCents) return null
  return `The claim is ${formatCents(claimAmountCents)} but the invoice subtotal is ${formatCents(invoiceSubtotalCents)}. Make them match before linking.`
}
