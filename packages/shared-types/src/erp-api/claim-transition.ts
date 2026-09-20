import { z } from 'zod'

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

const uuid = z.string().uuid().transform((value) => value.toLowerCase())
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
