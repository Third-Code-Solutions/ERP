import { z } from 'zod'

const claimStatusSchema = z.enum([
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

const invoiceStatusSchema = z.enum([
  'draft',
  'issued',
  'partial_payment',
  'paid',
  'overdue',
  'cancelled',
])

const cocStatusSchema = z.enum(['draft', 'pending_signature', 'signed'])

const blockerSchema = z.enum([
  'war_evidence_below_milestone',
  'coc_not_signed_for_final_milestone',
  'claim_not_certified',
  'claim_not_handed_to_finance',
  'invoice_not_linked',
  'invoice_not_issued',
])

export const projectBillingMilestoneListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict()

export const projectBillingMilestoneEvidenceSchema = z.object({
  lockedWarPeriods: z.number().int().nonnegative(),
  latestWarWeekEnding: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  latestWarOverallPct: z.number().finite().min(0).max(100).nullable(),
}).strict()

export const projectBillingMilestoneRowSchema = z.object({
  claimId: z.string().uuid(),
  claimNumber: z.string().min(1).max(32),
  milestonePct: z.number().int().min(0).max(100),
  amountCents: z.number().int().nonnegative(),
  claimStatus: claimStatusSchema,
  certificateDocumentId: z.string().uuid().nullable(),
  invoiceId: z.string().uuid().nullable(),
  invoiceNumber: z.string().max(50).nullable(),
  invoiceStatus: invoiceStatusSchema.nullable(),
  cocStatus: cocStatusSchema.nullable(),
  evidence: projectBillingMilestoneEvidenceSchema,
  readyForInvoice: z.boolean(),
  blockers: z.array(blockerSchema),
}).strict()

export const projectBillingMilestoneCocSchema = z.object({
  id: z.string().uuid(),
  status: cocStatusSchema,
  signedAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

export const projectBillingMilestoneListResultSchema = z.object({
  projectId: z.string().uuid(),
  coc: projectBillingMilestoneCocSchema.nullable(),
  rows: z.array(projectBillingMilestoneRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().positive(),
}).strict()

export type ProjectBillingMilestoneListQuery = z.infer<typeof projectBillingMilestoneListQuerySchema>
export type ProjectBillingMilestoneEvidence = z.infer<typeof projectBillingMilestoneEvidenceSchema>
export type ProjectBillingMilestoneRow = z.infer<typeof projectBillingMilestoneRowSchema>
export type ProjectBillingMilestoneCoc = z.infer<typeof projectBillingMilestoneCocSchema>
export type ProjectBillingMilestoneListResult = z.infer<typeof projectBillingMilestoneListResultSchema>
