import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/app/(dashboard)/projects/[id]/permits/actions', () => ({
  recordMobilizationInput: vi.fn(),
  startMobilization: vi.fn(),
}))

import { MobilizationReadinessPanel } from './mobilization-readiness-panel'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

const readiness = {
  commentedFcdReceivedAt: '2026-09-10T00:00:00.000Z',
  poCopiesReceivedAt: null,
  cariReceivedAt: null,
  ntpReceivedAt: null,
  startedAt: null,
  overrideReason: null,
}

describe('MobilizationReadinessPanel', () => {
  it('renders saved receipt status and labelled date controls', () => {
    const markup = renderToStaticMarkup(
      <MobilizationReadinessPanel
        projectId={PROJECT_ID}
        canOverride
        readiness={readiness}
        riskByInput={{
          commented_fcd_received_at: 3,
          po_copies_received_at: null,
          cari_received_at: null,
          ntp_received_at: null,
        }}
      />
    )

    expect(markup).toContain('Four returns before site start')
    expect(markup).toContain('1/4 returns received')
    expect(markup).toContain('aria-busy="false"')
    expect(markup).toContain('Saved')
    expect(markup).toContain('Not recorded')
    expect(markup).toContain('Received')
    expect(markup).not.toContain('3d overdue')
    expect(markup).toContain('Commented FCD received date')
    expect(markup).toContain('Override reason')
  })

  it('hides override controls when the role cannot authorize one', () => {
    const markup = renderToStaticMarkup(
      <MobilizationReadinessPanel
        projectId={PROJECT_ID}
        canOverride={false}
        readiness={readiness}
        riskByInput={{
          commented_fcd_received_at: null,
          po_copies_received_at: null,
          cari_received_at: null,
          ntp_received_at: null,
        }}
      />
    )

    expect(markup).toContain('Awaiting all four returns before mobilization can start.')
    expect(markup).not.toContain('Override reason (required if any return is missing)')
    expect(markup).not.toContain('Start with authorized override')
  })
})
