import { describe, expect, it } from 'vitest'
import {
  createOpportunityTenderCommandSchema,
  createTenderCriterionCommandSchema,
  opportunityTenderDetailResultSchema,
  tenderEvaluationSummaryRowSchema,
} from './opportunity-tenders'

const ID = '11111111-1111-4111-8111-111111111111'
const OPP = '22222222-2222-4222-8222-222222222222'

describe('opportunity tender contracts', () => {
  it('requires a BOQ evidence document for client-issued mode', () => {
    expect(createOpportunityTenderCommandSchema.safeParse({
      opportunityId: OPP,
      clientRequestId: ID,
      title: 'MNHPI fit-out tender',
      reference: 'TND-001',
      sourceMode: 'client_issued_boq',
      torDocumentId: null,
      boqDocumentId: null,
      closingAt: null,
    }).success).toBe(false)
  })

  it('accepts a valid weighted criterion and rejects zero weight', () => {
    const base = {
      name: 'Technical approach',
      description: '',
      criterionType: 'technical' as const,
      weightBps: 2_500,
      isRequired: true,
      sortOrder: 1,
    }
    expect(createTenderCriterionCommandSchema.parse(base)).toMatchObject(base)
    expect(createTenderCriterionCommandSchema.safeParse({ ...base, weightBps: 0 }).success).toBe(false)
  })

  it('keeps the detail response strict and score summaries bounded', () => {
    expect(tenderEvaluationSummaryRowSchema.parse({
      vendorProfileId: ID,
      vendorName: 'Acme Subcontracting',
      weightedScoreBps: 8_250,
      scoredCriteria: 2,
      criteriaCount: 3,
      complete: false,
    }).complete).toBe(false)
    expect(() => opportunityTenderDetailResultSchema.parse({ opportunityId: OPP, tender: null, deviations: [], criteria: [], vendorProfiles: [], scores: [], evaluationSummary: [], extra: true })).toThrow()
  })
})
