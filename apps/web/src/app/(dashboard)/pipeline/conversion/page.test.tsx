import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { can } from '@third-code-erp/auth'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { beforeEach, expect, it, vi } from 'vitest'
import {
  OpportunityKanbanCard,
  type KanbanCardData,
} from '@/components/pipeline/opportunity-kanban-card'

const mocks = vi.hoisted(() => ({ redirect: vi.fn(), stage: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('@/components/pipeline/stage-advance-button', () => ({
  StageAdvanceButton: (props: {
    opportunityId: string
    currentStage: string
  }) => {
    mocks.stage(props)
    return <button>Advance stage</button>
  },
}))
import PipelineListPage from '../list/page'

const card: KanbanCardData = {
  id: 'opportunity-one',
  stage: 'negotiation',
  tcv_cents: 2000000,
  gp_cents: 500000,
  weighted_tcv_cents: 1400000,
  probability: 70,
  updated_at: '2026-09-01',
  created_at: '2026-09-01',
  account_id: null,
  account_name: 'Example client',
  account_kyc_status: null,
  opportunity_kyc_initialized: false,
  opportunity_kyc_gate: null,
  project_id: 'project-one',
  project_name: 'Tenant-safe fit-out',
  rep_id: null,
  rep_email: null,
  sla: null,
}
beforeEach(() => vi.clearAllMocks())
it.each(ERP_ROLES)(
  'retains central mutation visibility in unified list for %s',
  (role) => {
    const allowed = can(role, 'opportunity.advance_stage')
    const html = renderToStaticMarkup(
      <OpportunityKanbanCard
        card={card}
        canAdvance={allowed}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />,
    )
    expect(html.includes('Advance stage')).toBe(allowed)
    expect(html).toContain('Example client')
    expect(html).toContain('Tenant-safe fit-out')
    expect(mocks.stage).toHaveBeenCalledTimes(allowed ? 1 : 0)
    if (allowed)
      expect(mocks.stage).toHaveBeenCalledWith({
        opportunityId: 'opportunity-one',
        currentStage: 'negotiation',
      })
  },
)
it('preserves filters when routing the old list to the unified workspace', async () => {
  await PipelineListPage({
    searchParams: Promise.resolve({ q: 'Example', stage: 'negotiation' }),
  })
  expect(mocks.redirect).toHaveBeenCalledWith(
    '/pipeline?q=Example&stage=negotiation&view=list',
  )
})
