import { z } from 'zod'

export const opportunityStageValues = [
  'opportunity_creation',
  'scoping',
  'bom_submission',
  'resubmission',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const

export type OpportunityStage = typeof opportunityStageValues[number]

// Stage probability mapping (0-100 integer)
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  opportunity_creation: 10,
  scoping: 25,
  bom_submission: 40,
  resubmission: 50,
  negotiation: 75,
  closed_won: 100,
  closed_lost: 0,
}

// Valid stage transitions
export const STAGE_TRANSITIONS: Record<OpportunityStage, OpportunityStage[]> = {
  opportunity_creation: ['scoping', 'closed_lost'],
  scoping: ['bom_submission', 'closed_lost'],
  bom_submission: ['resubmission', 'negotiation', 'closed_lost'],
  resubmission: ['bom_submission', 'negotiation', 'closed_lost'],
  negotiation: ['closed_won', 'closed_lost', 'resubmission'],
  closed_won: [],
  closed_lost: [],
}

export const createOpportunitySchema = z
  .object({
    // ABI Ops Phase 0: at least one of account_id or project_id must be
    // present. New opps coming through the M1 flow will use account_id;
    // legacy code paths can still pass project_id only.
    account_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    rep_id: z.string().uuid().optional(),
    stage: z.enum(opportunityStageValues).default('opportunity_creation'),
    tcv_cents: z.number().int().min(0).default(0),
    gp_cents: z.number().int().min(0).default(0),
    probability: z.number().int().min(0).max(100).default(0),
    closing_date: z.string().datetime({ offset: true }).optional(),
    area_sqm: z.number().int().positive().optional(),
    opportunity_type: z.string().max(100).optional(),
    remarks: z.string().max(5000).optional(),
  })
  .refine((v) => !!v.account_id || !!v.project_id, {
    message: 'Either account_id or project_id is required',
    path: ['account_id'],
  })

export const updateOpportunitySchema = z
  .object({
    rep_id: z.string().uuid().optional(),
    stage: z.enum(opportunityStageValues).optional(),
    tcv_cents: z.number().int().min(0).optional(),
    gp_cents: z.number().int().min(0).optional(),
    probability: z.number().int().min(0).max(100).optional(),
    closing_date: z.string().datetime({ offset: true }).optional(),
    area_sqm: z.number().int().positive().optional(),
    opportunity_type: z.string().max(100).optional(),
    remarks: z.string().max(5000).optional(),
  })
  .partial()

export const stageTransitionSchema = z.object({
  new_stage: z.enum(opportunityStageValues),
  reason: z.string().max(1000).optional(),
  tcv_cents: z.number().int().min(0).optional(),
  gp_cents: z.number().int().min(0).optional(),
  closing_date: z.string().datetime({ offset: true }).optional(),
})

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>
export type StageTransitionInput = z.infer<typeof stageTransitionSchema>

export const opportunityFiltersSchema = z.object({
  stage: z.enum(opportunityStageValues).optional(),
  rep_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type OpportunityFilters = z.infer<typeof opportunityFiltersSchema>
