import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { PipelineListTable } from './pipeline-list-table'
import type { KanbanCardData } from './opportunity-kanban-card'

const card: KanbanCardData = {
  id: '11111111-1111-4111-8111-111111111111',
  stage: 'negotiation',
  tcv_cents: 125_000_000,
  gp_cents: 25_000_000,
  weighted_tcv_cents: 87_500_000,
  probability: 70,
  closing_date: '2026-10-10',
  updated_at: '2026-09-10T00:00:00.000Z',
  created_at: '2026-09-01T00:00:00.000Z',
  account_id: '22222222-2222-4222-8222-222222222222',
  account_name: 'Acme Construction',
  account_kyc_status: 'approved',
  opportunity_kyc_initialized: false,
  opportunity_kyc_gate: null,
  project_id: null,
  project_name: null,
  rep_id: '33333333-3333-4333-8333-333333333333',
  rep_email: 'rep@example.test',
  sla: 'green',
}

describe('PipelineListTable', () => {
  it('renders an accessible, scannable list table', () => {
    const html = renderToStaticMarkup(
      <PipelineListTable cards={[card]} canAdvance={false} />,
    )
    expect(html).toContain('<table')
    expect(html).toContain('scope="col"')
    expect(html).toContain('scope="row"')
    expect(html).toContain('Pipeline opportunities in list view')
    expect(html).toContain('Acme Construction')
    expect(html).toContain('Negotiation')
    expect(html).toContain('₱1.3M')
    expect(html).toContain('Open')
  })
})
