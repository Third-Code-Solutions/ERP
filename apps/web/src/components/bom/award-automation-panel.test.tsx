import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(dashboard)/projects/[id]/bom/award-actions', () => ({
  awardLockedBom: vi.fn(),
  reverseAwardHandoff: vi.fn(),
}))

import { AwardAutomationPanel } from './award-automation-panel'

const PROPS = {
  projectId: '33333333-3333-4333-8333-333333333333',
  bomId: '55555555-5555-4555-8555-555555555555',
  projectCode: 'ABI-2026-001',
  handoff: null,
} as const

const ACTIVE_HANDOFF = {
  id: '77777777-7777-4777-8777-777777777777',
  status: 'active' as const,
  projectCode: 'ABI-2026-001',
  budgetId: 'budget-1',
  dpInvoiceId: 'invoice-1',
  projectTrackerId: 'tracker-1',
  taskIds: {
    arProjectCode: 'task-ar',
    downPaymentInvoice: 'task-dp',
    cari: 'task-cari',
    projectTracker: 'task-tracker',
    cxOnboarding: 'task-cx',
  },
}

describe('AwardAutomationPanel', () => {
  it('renders the award form with an explicit busy state and accessible controls', () => {
    const markup = renderToStaticMarkup(<AwardAutomationPanel {...PROPS} />)

    expect(markup).toContain('aria-labelledby="award-automation-title"')
    expect(markup).toContain('aria-busy="false"')
    expect(markup).toContain('<label')
    expect(markup).toContain('Down payment %')
    expect(markup).toContain('Create award handoff')
    expect(markup).toContain('aria-live="polite"')
  })

  it('keeps the reversal reason default and labels the active handoff path', () => {
    const markup = renderToStaticMarkup(<AwardAutomationPanel {...PROPS} handoff={ACTIVE_HANDOFF} />)

    expect(markup).toContain('Awarded')
    expect(markup).toContain('Reversal reason')
    expect(markup).toContain('value="Commercial award requires correction"')
    expect(markup).toContain('Reverse handoff')
  })
})
