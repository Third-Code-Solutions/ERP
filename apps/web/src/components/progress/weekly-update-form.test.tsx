import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(dashboard)/projects/[id]/progress/actions', () => ({
  submitWeeklyProgress: vi.fn(),
}))
vi.mock('@/app/(dashboard)/projects/[id]/progress/weekly-command-actions', () => ({
  captureWeeklyProgressCommand: vi.fn(),
}))

import { WeeklyUpdateForm } from './weekly-update-form'

const PROPS = {
  projectId: '33333333-3333-4333-8333-333333333333',
  tenantId: '22222222-2222-4222-8222-222222222222',
  actorId: '11111111-1111-4111-8111-111111111111',
  defaultWeekEnding: '2026-09-13',
  canSubmit: true,
  coreWritesEnabled: true,
}

describe('WeeklyUpdateForm', () => {
  it('renders the existing progress fields with the Core receipt-backed submit affordance', () => {
    const markup = renderToStaticMarkup(<WeeklyUpdateForm {...PROPS} />)
    expect(markup).toContain('Week ending')
    expect(markup).toContain('Civil %')
    expect(markup).toContain('Overall %')
    expect(markup).toContain('Submit weekly progress')
    expect(markup).toContain('receipt')
  })

  it('preserves the legacy form surface when the Core write canary is disabled', () => {
    const markup = renderToStaticMarkup(<WeeklyUpdateForm {...PROPS} coreWritesEnabled={false} />)
    expect(markup).toContain('Submit weekly progress')
    expect(markup).toContain('2026-09-13')
  })

  it('hides the form for a role without submit capability', () => {
    const markup = renderToStaticMarkup(<WeeklyUpdateForm {...PROPS} canSubmit={false} />)
    expect(markup).toBe('')
  })
})
