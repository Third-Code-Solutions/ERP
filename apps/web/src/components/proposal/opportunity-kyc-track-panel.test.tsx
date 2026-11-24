import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/crm/opportunities/[id]/proposal/kyc-actions', () => ({
  updateOpportunityKycTrack: vi.fn(),
}))

import {
  OpportunityKycTrackPanel,
  REJECT_TRACK_CONFIRMATION,
  type OpportunityKycTrackView,
} from './opportunity-kyc-track-panel'

const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'

function track(status: OpportunityKycTrackView['status'], overrides: Partial<OpportunityKycTrackView> = {}): OpportunityKycTrackView {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    track_type: 'credit_investigation',
    status,
    due_at: '2026-12-01T00:00:00.000Z',
    prepared_at: null,
    fc_recommended_at: null,
    president_decided_at: null,
    decision_reason: null,
    notes: null,
    ...overrides,
  }
}

function render(view: OpportunityKycTrackView, canManage = true, canApprove = true): string {
  return renderToStaticMarkup(
    <OpportunityKycTrackPanel
      opportunityId={OPPORTUNITY_ID}
      tracks={[view]}
      canManage={canManage}
      canApprove={canApprove}
    />
  )
}

describe('OpportunityKycTrackPanel', () => {
  it('offers Recommend clear on a flagged track without offering to flag it again', () => {
    const markup = render(track('flagged', { decision_reason: 'Adverse report' }))

    expect(markup).toContain('value="recommend"')
    expect(markup).not.toContain('value="flag"')
    expect(markup).toContain('value="reject"')
  })

  it('keeps Start, Recommend clear and Flag on a pending track', () => {
    const markup = render(track('pending'))

    expect(markup).toContain('value="start"')
    expect(markup).toContain('value="recommend"')
    expect(markup).toContain('value="flag"')
  })

  it('leaves a rejected track without any review action', () => {
    const markup = render(track('rejected', { decision_reason: 'Failed credit check' }))

    expect(markup).not.toContain('value="recommend"')
    expect(markup).not.toContain('value="reject"')
    expect(markup).not.toContain('value="approve"')
  })

  it('shows no Recommend clear to a role that cannot manage review tracks', () => {
    const markup = render(track('flagged'), false, false)

    expect(markup).not.toContain('<form')
  })

  it('asks for confirmation before a rejection is submitted', () => {
    const source = readFileSync(new URL('./opportunity-kyc-track-panel.tsx', import.meta.url), 'utf8')

    expect(REJECT_TRACK_CONFIRMATION).toContain('Reject this review track?')
    expect(source).toContain('!window.confirm(REJECT_TRACK_CONFIRMATION)')
    expect(source).toContain('event.preventDefault()')
  })
})
