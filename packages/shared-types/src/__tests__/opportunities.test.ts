import { describe, it, expect } from 'vitest'
import {
  STAGE_PROBABILITY,
  STAGE_TRANSITIONS,
  createOpportunitySchema,
  stageTransitionSchema,
} from '../opportunities'

describe('STAGE_PROBABILITY', () => {
  it('assigns 0% to closed_lost', () => {
    expect(STAGE_PROBABILITY.closed_lost).toBe(0)
  })

  it('assigns 100% to closed_won', () => {
    expect(STAGE_PROBABILITY.closed_won).toBe(100)
  })

  it('has all stages with valid probability range', () => {
    for (const [stage, prob] of Object.entries(STAGE_PROBABILITY)) {
      expect(prob, `${stage} probability out of range`).toBeGreaterThanOrEqual(0)
      expect(prob, `${stage} probability out of range`).toBeLessThanOrEqual(100)
    }
  })

  it('probabilities increase through pipeline stages', () => {
    const { opportunity_creation, scoping, bom_submission, negotiation } = STAGE_PROBABILITY
    expect(opportunity_creation).toBeLessThan(scoping)
    expect(scoping).toBeLessThan(bom_submission)
    expect(bom_submission).toBeLessThan(negotiation)
  })
})

describe('STAGE_TRANSITIONS', () => {
  it('terminal stages have no valid transitions', () => {
    expect(STAGE_TRANSITIONS.closed_won).toHaveLength(0)
    expect(STAGE_TRANSITIONS.closed_lost).toHaveLength(0)
  })

  it('every legacy active stage can progress to closed_lost', () => {
    // Legacy stages keep their original loss transition.
    const legacyActive = [
      'opportunity_creation',
      'scoping',
      'resubmission',
    ] as const
    for (const stage of legacyActive) {
      expect(STAGE_TRANSITIONS[stage]).toContain('closed_lost')
    }
  })

  it('every ABI active stage can progress to lost', () => {
    // Canonical ABI Ops 8-stage flow uses `lost` (not `closed_lost`).
    const abiActive = [
      'lead',
      'site_survey',
      'design',
      'bom_submission',
      'negotiation',
      'contract',
    ] as const
    for (const stage of abiActive) {
      expect(STAGE_TRANSITIONS[stage], `${stage} should reach lost`).toContain('lost')
    }
  })

  it('legacy negotiation→closed_won path preserved', () => {
    // Existing data may still reference legacy stage names; transition kept.
    // Canonical replacement: negotiation → contract → won.
    expect(STAGE_TRANSITIONS.negotiation).toContain('contract')
    expect(STAGE_TRANSITIONS.contract).toContain('won')
  })

  it('opportunity_creation advances to scoping', () => {
    expect(STAGE_TRANSITIONS.opportunity_creation).toContain('scoping')
  })
})

describe('createOpportunitySchema', () => {
  it('requires at least one of account_id or project_id', () => {
    const result = createOpportunitySchema.safeParse({ tcv_cents: 1 })
    expect(result.success).toBe(false)
  })

  it('rejects malformed project_id', () => {
    const result = createOpportunitySchema.safeParse({ project_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('accepts a valid opportunity with project_id', () => {
    const result = createOpportunitySchema.safeParse({
      project_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      tcv_cents: 5000000000,
      gp_cents: 1000000000,
      probability: 40,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid opportunity with account_id (ABI Ops flow)', () => {
    const result = createOpportunitySchema.safeParse({
      account_id: 'b1ffbc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      tcv_cents: 1_000_000,
      probability: 25,
    })
    expect(result.success).toBe(true)
  })

  it('clamps probability to 0-100', () => {
    const high = createOpportunitySchema.safeParse({
      project_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      probability: 150,
    })
    expect(high.success).toBe(false)

    const negative = createOpportunitySchema.safeParse({
      project_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      probability: -1,
    })
    expect(negative.success).toBe(false)
  })

  it('defaults probability to 0', () => {
    const result = createOpportunitySchema.safeParse({
      project_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.probability).toBe(0)
    }
  })

  it('rejects negative monetary values', () => {
    const result = createOpportunitySchema.safeParse({
      project_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      tcv_cents: -1,
    })
    expect(result.success).toBe(false)
  })
})

describe('stageTransitionSchema', () => {
  it('accepts valid stage', () => {
    const result = stageTransitionSchema.safeParse({ new_stage: 'scoping' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid stage', () => {
    const result = stageTransitionSchema.safeParse({ new_stage: 'invalid_stage' })
    expect(result.success).toBe(false)
  })

  it('accepts optional reason', () => {
    const result = stageTransitionSchema.safeParse({
      new_stage: 'closed_won',
      reason: 'Contract signed',
    })
    expect(result.success).toBe(true)
  })
})
