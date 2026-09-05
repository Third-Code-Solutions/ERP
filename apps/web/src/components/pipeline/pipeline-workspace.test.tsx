import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import {
  OpportunityKanbanCard,
  type KanbanCardData,
} from './opportunity-kanban-card'

vi.mock('@/app/(dashboard)/pipeline/actions', () => ({
  advanceOpportunityStage: vi.fn(),
}))
const card: KanbanCardData = {
  id: 'opportunity-one',
  stage: 'lead',
  tcv_cents: 0,
  gp_cents: 0,
  weighted_tcv_cents: 0,
  probability: 0,
  closing_date: '2026-09-30',
  updated_at: '2026-09-01',
  created_at: '2026-09-01',
  account_id: null,
  account_name: 'Example account',
  account_kyc_status: null,
  opportunity_kyc_initialized: false,
  opportunity_kyc_gate: null,
  project_id: 'project-one',
  project_name: 'Example project',
  rep_id: null,
  rep_email: null,
  sla: null,
}
it('provides keyboard navigable opportunity and project links with accurate age wording', () => {
  const html = renderToStaticMarkup(
    <OpportunityKanbanCard
      card={card}
      canAdvance={false}
      onDragStart={() => {}}
      onDragEnd={() => {}}
    />,
  )
  expect(html).toContain('/crm/opportunities/opportunity-one')
  expect(html).toContain('/projects/project-one')
  expect(html).toContain('Unassigned')
  expect(html).toContain('2026-09-30')
  expect(html).toContain('Weighted value')
  expect(html).toContain('Gross profit')
  expect(html).not.toContain('d in stage')
})
