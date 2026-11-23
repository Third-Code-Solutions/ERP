import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/(dashboard)/projects/[id]/checklist/actions', () => ({
  updateChecklistItemStatusForm: vi.fn(),
}))

import { ChecklistItemRow } from './checklist-item-row'

const ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Mobilization permit',
  owner_role: 'safety',
  sla_days: 5,
  status: 'not_started' as const,
  blocker_reason: null,
  sla_clock_started_at: null,
  completed_at: null,
  depends_on_item_id: null,
}

describe('ChecklistItemRow', () => {
  it('shows the status buttons to a role that may manage the checklist', () => {
    const html = renderToStaticMarkup(
      <ChecklistItemRow projectId="p-1" canManage item={ITEM} />
    )

    expect(html).toContain('Mobilization permit')
    expect(html).toContain('Start')
  })

  it('renders the item read-only when the role lacks the capability', () => {
    const html = renderToStaticMarkup(
      <ChecklistItemRow
        projectId="p-1"
        canManage={false}
        item={{ ...ITEM, status: 'in_progress' }}
      />
    )

    expect(html).toContain('Mobilization permit')
    expect(html).toContain('In progress')
    expect(html).not.toContain('Complete')
    expect(html).not.toContain('Block')
  })
})
