import { z } from 'zod'

export const opportunityKycTrackTypeValues = [
  'financial_evaluation',
  'credit_investigation',
] as const

/** Client-safe canonical order for the two independent Finance review tracks. */
export const OPPORTUNITY_KYC_TRACK_TYPES = opportunityKycTrackTypeValues

export const opportunityKycTrackStatusValues = [
  'pending',
  'in_review',
  'approved',
  'flagged',
  'rejected',
] as const

export const opportunityKycTrackActionValues = [
  'start',
  'recommend',
  'approve',
  'flag',
  'reject',
] as const

export const opportunityKycTrackTypeSchema = z.enum(opportunityKycTrackTypeValues)
export const opportunityKycTrackActionSchema = z.enum(opportunityKycTrackActionValues)

export const opportunityKycTrackCommandSchema = z.object({
  opportunity_id: z.string().uuid(),
  track_type: opportunityKycTrackTypeSchema,
  action: opportunityKycTrackActionSchema,
  notes: z.string().trim().max(2000).optional(),
}).strict()

export type OpportunityKycTrackType = (typeof opportunityKycTrackTypeValues)[number]
export type OpportunityKycTrackStatus = (typeof opportunityKycTrackStatusValues)[number]
export type OpportunityKycTrackAction = (typeof opportunityKycTrackActionValues)[number]
export type OpportunityKycTrackCommand = z.infer<typeof opportunityKycTrackCommandSchema>

const opportunityKycTrackLabels: Record<OpportunityKycTrackType, string> = {
  financial_evaluation: 'Financial Evaluation',
  credit_investigation: 'Credit Investigation',
}

export function opportunityKycTrackLabel(trackType: OpportunityKycTrackType): string {
  return opportunityKycTrackLabels[trackType]
}

export function opportunityKycTrackStatusLabel(status: OpportunityKycTrackStatus): string {
  return status.replace('_', ' ')
}
