import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(dashboard)/projects/[id]/progress/actions', () => ({
  lockWeeklyProgress: vi.fn(),
}))
vi.mock('@/app/(dashboard)/projects/[id]/progress/weekly-command-actions', () => ({
  lockWeeklyProgressCommand: vi.fn(),
}))

import { WeeklyWarLedger } from './weekly-war-ledger'

const ROW = {
  id: '44444444-4444-4444-8444-444444444444',
  projectId: '33333333-3333-4333-8333-333333333333',
  progressUpdateId: '55555555-5555-4555-8555-555555555555',
  clientRequestId: '66666666-6666-4666-8666-666666666666',
  weekEnding: '2026-09-13',
  cutoffAt: '2026-09-17T09:00:00.000Z',
  status: 'locked' as const,
  percentByCategory: { civil_pct: 40, electrical_pct: 50, mep_pct: 30, finishes_pct: 20, overall_pct: 35 },
  notes: 'WAR evidence',
  warSnapshot: { weekEnding: '2026-09-13', overallPct: 35, percentByCategory: { civil_pct: 40, electrical_pct: 50, mep_pct: 30, finishes_pct: 20, overall_pct: 35 }, notes: 'WAR evidence', capturedAt: '2026-09-17T09:00:00.000Z' },
  lockedAt: '2026-09-17T09:00:00.000Z',
  lockedBy: '11111111-1111-4111-8111-111111111111',
  lockReason: 'Thursday cut-off',
  version: 2,
  createdBy: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-09-10T00:00:00.000Z',
  updatedAt: '2026-09-17T09:00:00.000Z',
}

describe('WeeklyWarLedger', () => {
  it('renders immutable status and cut-off evidence', () => {
    const markup = renderToStaticMarkup(<WeeklyWarLedger projectId={ROW.projectId} rows={[ROW]} canLock tenantId="22222222-2222-4222-8222-222222222222" actorId={ROW.lockedBy!} enabled />)
    expect(markup).toContain('WAR cut-off ledger')
    expect(markup).toContain('Locked')
    expect(markup).toContain('Immutable evidence')
    expect(markup).toContain('35%')
  })

  it('keeps the ledger visible for read-only roles and reports a read failure truthfully', () => {
    const markup = renderToStaticMarkup(
      <WeeklyWarLedger
        projectId={ROW.projectId}
        rows={[ROW]}
        canLock={false}
        tenantId="22222222-2222-4222-8222-222222222222"
        actorId={ROW.lockedBy!}
        enabled
        loadError="Core weekly evidence is unavailable."
      />,
    )
    expect(markup).toContain('WAR cut-off ledger')
    expect(markup).toContain('Core weekly evidence is unavailable.')
    expect(markup).not.toContain('Lock WAR')
  })

  it('hides only when the Core ledger is disabled', () => {
    const markup = renderToStaticMarkup(
      <WeeklyWarLedger
        projectId={ROW.projectId}
        rows={[]}
        canLock
        tenantId="22222222-2222-4222-8222-222222222222"
        actorId={ROW.createdBy}
        enabled={false}
      />,
    )
    expect(markup).toBe('')
  })
})
