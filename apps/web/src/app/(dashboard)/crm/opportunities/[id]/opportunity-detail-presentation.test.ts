import { describe, expect, it } from 'vitest'
import {
  formatOpportunityDate,
  opportunityTypeLabel,
  opportunityWorkspaceAccess,
} from './opportunity-detail-presentation'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'

describe('opportunity detail presentation', () => {
  it('renders dates in the Manila calendar day', () => {
    expect(formatOpportunityDate('2026-09-30T16:30:00.000Z')).toBe('Oct 1, 2026')
  })

  it('uses readable opportunity type labels', () => {
    expect(opportunityTypeLabel('fit_out')).toBe('Fit-out')
  })

  it('keeps won/project gates and route permissions on workspace links', () => {
    expect(
      opportunityWorkspaceAccess({ role: 'sales', projectId: PROJECT_ID, stage: 'won' })
    ).toMatchObject({ canViewBom: false, canViewProject: true })

    expect(
      opportunityWorkspaceAccess({ role: 'owner', projectId: PROJECT_ID, stage: 'negotiation' })
    ).toMatchObject({ canViewBom: true, canViewProject: false })

    expect(
      opportunityWorkspaceAccess({ role: 'owner', projectId: PROJECT_ID, stage: 'closed_won' })
    ).toMatchObject({ canViewBom: true, canViewProject: true })
  })
})
