import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProjectBillingMilestoneCard } from './project-billing-milestone-card'

const RESULT = {
  projectId: '33333333-3333-4333-8333-333333333333',
  coc: { id: '55555555-5555-4555-8555-555555555555', status: 'signed' as const, signedAt: '2026-09-17T09:00:00.000Z' },
  rows: [{
    claimId: '44444444-4444-4444-8444-444444444444', claimNumber: 'PC-00001', milestonePct: 50, amountCents: 100_000, claimStatus: 'handed_over_finance' as const,
    certificateDocumentId: null, invoiceId: null, invoiceNumber: null, invoiceStatus: null, cocStatus: 'signed' as const,
    evidence: { lockedWarPeriods: 1, latestWarWeekEnding: '2026-09-13', latestWarOverallPct: 50 }, readyForInvoice: true, blockers: [],
  }], total: 1, page: 1, limit: 25, totalPages: 1,
}

describe('ProjectBillingMilestoneCard', () => {
  it('renders the linked chain and invoice readiness', () => {
    const markup = renderToStaticMarkup(<ProjectBillingMilestoneCard result={RESULT} />)
    expect(markup).toContain('Milestone billing traceability')
    expect(markup).toContain('COC: Signed')
    expect(markup).toContain('Ready for invoice')
    expect(markup).toContain('PC-00001')
  })
})
