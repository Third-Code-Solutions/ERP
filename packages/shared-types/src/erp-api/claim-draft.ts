import { z } from 'zod'

// The 409 code Core sends when a draft would exceed the contract sum; the web
// shows Core's message for this code as is.
export const CLAIM_CAP_EXCEEDED_CODE = 'claim_cap_exceeded'

const uuid = z.string().guid().transform(value => value.toLowerCase())
const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const milestone = z.number().int().min(0).max(100)
const description = z.string().max(5000).nullable().default(null).transform(value => value === '' ? null : value)

export const createClaimDraftCommandSchema = z.object({
  clientRequestId: uuid,
  projectId: uuid,
  milestonePct: milestone,
  amountCents: amount,
  description,
}).strict()

export const claimDraftCommandReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.literal('create_draft'),
  tenantId: uuid,
  actorId: uuid,
  projectId: uuid,
  clientRequestId: uuid,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  claim: z.object({
    id: uuid,
    claimNumber: z.string().regex(/^PC-[0-9]{5,29}$/).max(32),
    milestonePct: milestone,
    amountCents: amount,
    description,
    status: z.literal('draft'),
    createdBy: uuid,
    createdAt: z.string().datetime({ offset: true }),
  }).strict(),
}).strict()

export const createClaimDraftResultSchema = z.object({
  projectId: uuid,
  created: z.boolean(),
  changed: z.boolean(),
  receipt: claimDraftCommandReceiptSchema,
}).strict()

export type CreateClaimDraftCommand = z.infer<typeof createClaimDraftCommandSchema>
export type ClaimDraftCommandReceipt = z.infer<typeof claimDraftCommandReceiptSchema>
export type CreateClaimDraftResult = z.infer<typeof createClaimDraftResultSchema>

export function claimDraftPayload(command: z.input<typeof createClaimDraftCommandSchema>): string {
  const input = createClaimDraftCommandSchema.parse(command)
  return JSON.stringify({ operation: 'create_draft', projectId: input.projectId, milestonePct: input.milestonePct, amountCents: input.amountCents, description: input.description })
}
