import { describe, expect, it } from 'vitest'
import {
  projectBillingMilestoneListResultSchema,
  projectBillingMilestoneListQuerySchema,
} from './project-billing-milestones'

describe('project billing milestone contracts', () => {
  it('defaults the paginated read query and validates the COC/claim chain', () => {
    expect(projectBillingMilestoneListQuerySchema.parse({})).toEqual({ page: 1, limit: 25 })
    const result = projectBillingMilestoneListResultSchema.parse({
      projectId: '33333333-3333-4333-8333-333333333333',
      coc: { id: '44444444-4444-4444-8444-444444444444', status: 'signed', signedAt: '2026-09-17T09:00:00.000Z' },
      rows: [{
        claimId: '55555555-5555-4555-8555-555555555555',
        claimNumber: 'PC-00001',
        milestonePct: 50,
        amountCents: 100_000,
        claimStatus: 'handed_over_finance',
        certificateDocumentId: null,
        invoiceId: null,
        invoiceNumber: null,
        invoiceStatus: null,
        cocStatus: 'signed',
        evidence: { lockedWarPeriods: 1, latestWarWeekEnding: '2026-09-13', latestWarOverallPct: 50 },
        readyForInvoice: true,
        blockers: [],
      }],
      total: 1,
      page: 1,
      limit: 25,
      totalPages: 1,
    })
    expect(result.rows[0]?.readyForInvoice).toBe(true)
  })

  it('rejects unknown blockers and malformed money/status values', () => {
    expect(() => projectBillingMilestoneListResultSchema.parse({ rows: [] })).toThrow()
    expect(() => projectBillingMilestoneListResultSchema.parse({
      projectId: '33333333-3333-4333-8333-333333333333',
      coc: null,
      rows: [{
        claimId: '55555555-5555-4555-8555-555555555555', claimNumber: 'PC-00001', milestonePct: 50, amountCents: -1,
        claimStatus: 'draft', certificateDocumentId: null, invoiceId: null, invoiceNumber: null, invoiceStatus: null, cocStatus: null,
        evidence: { lockedWarPeriods: 0, latestWarWeekEnding: null, latestWarOverallPct: null }, readyForInvoice: false,
        blockers: ['made_up_blocker'],
      }], total: 1, page: 1, limit: 25, totalPages: 1,
    })).toThrow()
  })
})
