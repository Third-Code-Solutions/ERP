import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ProjectBillingMilestoneListResult } from '@third-code-erp/shared-types'
import { ProjectBillingMilestoneCard } from './project-billing-milestone-card'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const INVOICE_ID = '66666666-6666-4666-8666-666666666666'
const RESULT: ProjectBillingMilestoneListResult = {
  projectId: PROJECT_ID,
  coc: { id: '55555555-5555-4555-8555-555555555555', status: 'signed' as const, signedAt: '2026-09-17T09:00:00.000Z' },
  rows: [{
    claimId: CLAIM_ID, claimNumber: 'PC-00001', milestonePct: 50, amountCents: 100_000, claimStatus: 'handed_over_finance',
    certificateDocumentId: '77777777-7777-4777-8777-777777777777', invoiceId: INVOICE_ID, invoiceNumber: 'INV-00001', invoiceStatus: 'issued', cocStatus: 'signed',
    evidence: { lockedWarPeriods: 1, latestWarWeekEnding: '2026-09-13', latestWarOverallPct: 50 }, readyForInvoice: false,
    blockers: ['war_evidence_below_milestone', 'coc_not_signed_for_final_milestone', 'claim_not_certified', 'claim_not_handed_to_finance', 'invoice_not_linked', 'invoice_not_issued'],
  }], total: 26, page: 1, limit: 25, totalPages: 2,
}

const PAGINATION = {
  previousHref: null,
  nextHref: `/projects/${PROJECT_ID}/billing?milestonePage=2&tab=overview`,
  firstHref: `/projects/${PROJECT_ID}/billing?milestonePage=1&tab=overview`,
}

function emptyResult(overrides: Partial<ProjectBillingMilestoneListResult> = {}): ProjectBillingMilestoneListResult {
  return {
    ...RESULT,
    rows: [],
    total: 0,
    page: 1,
    totalPages: 1,
    ...overrides,
  }
}

describe('ProjectBillingMilestoneCard', () => {
  it('renders every blocker, source link, project navigation, count, and pagination choice', () => {
    const markup = renderToStaticMarkup(<ProjectBillingMilestoneCard result={RESULT} pagination={PAGINATION} />)
    expect(markup).toContain('Milestone billing traceability')
    expect(markup).toContain('COC: Signed')
    expect(markup).toContain('PC-00001')
    expect(markup).toContain('Showing 1–1 of 26 progress claims')
    expect(markup).toContain('Locked WAR evidence is below this milestone')
    expect(markup).toContain('COC must be signed for the 90%/100% gate')
    expect(markup).toContain('Claim still needs commercial certification')
    expect(markup).toContain('Claim still needs Finance handover')
    expect(markup).toContain('Invoice link is missing')
    expect(markup).toContain('Linked invoice is still a draft')
    expect(markup).toContain(`href="/claims/${CLAIM_ID}"`)
    expect(markup).toContain(`href="/invoices/${INVOICE_ID}"`)
    expect(markup).toContain(`href="/projects/${PROJECT_ID}/progress"`)
    expect(markup).toContain(`href="/projects/${PROJECT_ID}/turnover"`)
    expect(markup).toContain(`href="${PAGINATION.nextHref.replace('&', '&amp;')}"`)
  })

  it('distinguishes a project with no claims from an out-of-range page', () => {
    const emptyMarkup = renderToStaticMarkup(
      <ProjectBillingMilestoneCard result={emptyResult()} pagination={{ ...PAGINATION, nextHref: null }} />,
    )
    expect(emptyMarkup).toContain('No progress claims are linked to this project yet.')
    expect(emptyMarkup).not.toContain('outside the available range')

    const outOfRangeMarkup = renderToStaticMarkup(
      <ProjectBillingMilestoneCard
        result={emptyResult({ total: 26, page: 3, totalPages: 2 })}
        pagination={{ ...PAGINATION, previousHref: `/projects/${PROJECT_ID}/billing?milestonePage=2`, nextHref: null }}
      />,
    )
    expect(outOfRangeMarkup).toContain('Page 3 has no progress claims in the available range.')
    expect(outOfRangeMarkup).toContain('Return to first page')
    expect(outOfRangeMarkup).toContain(`href="${PAGINATION.firstHref.replace('&', '&amp;')}"`)
    expect(outOfRangeMarkup).not.toContain('No progress claims are linked to this project yet.')
  })

  it('renders disabled boundary controls without navigation', () => {
    const markup = renderToStaticMarkup(
      <ProjectBillingMilestoneCard result={RESULT} pagination={PAGINATION} />,
    )
    expect(markup).toMatch(/aria-disabled="true"[^>]*>Previous<\/span>/)
    expect(markup).toContain('Next')
  })

  it('reports the page row count when a response count cannot describe a safe range', () => {
    const markup = renderToStaticMarkup(
      <ProjectBillingMilestoneCard
        result={{ ...RESULT, total: 1, page: 2, totalPages: 1 }}
        pagination={{ ...PAGINATION, nextHref: null }}
      />,
    )
    expect(markup).toContain('Showing 1 progress claim on this page (1 progress claim reported)')
    expect(markup).not.toContain('Showing 26–1')
  })

  it('keeps returned rows visible when a raced count reports zero', () => {
    const markup = renderToStaticMarkup(
      <ProjectBillingMilestoneCard
        result={{ ...RESULT, total: 0, totalPages: 1 }}
        pagination={{ ...PAGINATION, nextHref: null }}
      />,
    )
    expect(markup).toContain('PC-00001')
    expect(markup).toContain('Showing 1 progress claim on this page (0 progress claims reported)')
    expect(markup).not.toContain('No progress claims are linked to this project yet.')
  })
})
