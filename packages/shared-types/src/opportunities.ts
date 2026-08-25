import { z } from 'zod'

// Stage values include legacy + ABI OPS canonical. Legacy values map to
// their current equivalents via STAGE_LEGACY_MAP below.
export const opportunityStageValues = [
  // Legacy
  'opportunity_creation',
  'scoping',
  'resubmission',
  'closed_won',
  'closed_lost',
  // ABI OPS 8-stage canonical
  'lead',
  'site_survey',
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
  'lost',
] as const

export type OpportunityStage = typeof opportunityStageValues[number]

// The 8 canonical ABI OPS stages (UI-facing).
export const PIPELINE_STAGES = [
  'lead',
  'site_survey',
  'design',
  'bom_submission',
  'negotiation',
  'contract',
  'won',
  'lost',
] as const satisfies readonly OpportunityStage[]

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

// Map legacy stage values onto their canonical equivalent so dashboards/Kanban
// can group consistently.
export const STAGE_LEGACY_MAP: Record<OpportunityStage, PipelineStage> = {
  opportunity_creation: 'lead',
  scoping: 'site_survey',
  resubmission: 'negotiation',
  closed_won: 'won',
  closed_lost: 'lost',
  lead: 'lead',
  site_survey: 'site_survey',
  design: 'design',
  bom_submission: 'bom_submission',
  negotiation: 'negotiation',
  contract: 'contract',
  won: 'won',
  lost: 'lost',
}

// Stage probability mapping (0-100 integer). Legacy values inherit the
// probability of their canonical equivalent so weighted_tcv_cents math is
// consistent across both taxonomies.
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  // Legacy
  opportunity_creation: 10,
  scoping: 25,
  resubmission: 50,
  closed_won: 100,
  closed_lost: 0,
  // Current canonical
  lead: 10,
  site_survey: 25,
  design: 40,
  bom_submission: 55,
  negotiation: 75,
  contract: 90,
  won: 100,
  lost: 0,
}

// Valid stage transitions.
// Legacy chain preserved verbatim. Current canonical chain:
//   lead → site_survey → design → bom_submission → negotiation →
//   contract → won. `lost` is reachable from anything except won.
export const STAGE_TRANSITIONS: Record<OpportunityStage, OpportunityStage[]> = {
  // Legacy
  opportunity_creation: ['scoping', 'lead', 'closed_lost', 'lost'],
  scoping: ['bom_submission', 'site_survey', 'closed_lost', 'lost'],
  resubmission: ['bom_submission', 'negotiation', 'closed_lost', 'lost'],
  closed_won: [],
  closed_lost: [],
  // Current canonical
  lead: ['site_survey', 'lost'],
  site_survey: ['design', 'lost'],
  design: ['bom_submission', 'lost'],
  bom_submission: ['negotiation', 'lost'],
  negotiation: ['contract', 'bom_submission', 'lost'],
  contract: ['won', 'lost'],
  won: [],
  lost: [],
}

export const createOpportunitySchema = z
  .object({
    // ABI OPS Phase 0: at least one of account_id or project_id must be
    // present. New opps coming through the M1 flow will use account_id;
    // legacy code paths can still pass project_id only.
    account_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    prospective_project_name: z.string().trim().min(1).max(200).optional(),
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
    prospective_project_name: z.string().trim().min(1).max(200).optional(),
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
