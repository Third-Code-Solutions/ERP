import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { can, type AppRole } from '@third-code-erp/auth'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { OpportunityPanel } from './opportunity-panel'

vi.mock('@/app/(dashboard)/projects/[id]/opportunities/actions', () => ({
  createOpportunity: vi.fn(),
  transitionStage: vi.fn(),
}))

beforeAll(() => {
  vi.stubGlobal('React', React)
})

const ROLES: AppRole[] = [
  'owner',
  'admin',
  'sales',
  'estimator',
  'pm',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
]

const opportunity = {
  id: '11111111-1111-4111-8111-111111111111',
  stage: 'negotiation',
  tcv_cents: 1_500_000,
  gp_cents: -25_000,
  probability: 75,
  weighted_tcv_cents: 1_125_000,
  closing_date: new Date('2026-10-15T00:00:00+08:00'),
  area_sqm: 875,
  opportunity_type: 'Fit-out',
}

describe('OpportunityPanel role projection', () => {
  it.each(ROLES)('shows the exact mutation surface for %s', (role) => {
    const expectedMutationAccess = ['owner', 'admin', 'sales'].includes(role)
    const canCreate = can(role, 'opportunity.create')
    const canMutate = can(role, 'opportunity.advance_stage')
    expect(canCreate).toBe(expectedMutationAccess)
    expect(canMutate).toBe(expectedMutationAccess)
    const markup = renderToStaticMarkup(
      <OpportunityPanel
        projectId="22222222-2222-4222-8222-222222222222"
        opportunities={[opportunity]}
        canCreate={canCreate}
        canMutate={canMutate}
      />
    )

    expect(markup.includes('+ Add Opportunity')).toBe(canCreate)
    expect(markup.includes('>Advance<')).toBe(canMutate)
    expect(markup.includes('Opportunity data is read-only.')).toBe(
      !canCreate && !canMutate
    )
    expect(markup.includes('role="status"')).toBe(!canCreate && !canMutate)
    expect(markup).toContain('Fit-out')
    expect(markup).toContain('Oct 15, 2026')
    expect(markup).toContain('-₱250')
  })
})
