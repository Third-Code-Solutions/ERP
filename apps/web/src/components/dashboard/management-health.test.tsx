import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ManagementHealth } from './management-health'

const data = {
  projectMargins: [
    {
      projectId: 'project-1',
      projectName: 'Harbor Office',
      projectCode: 'ABI-001',
      projectStatus: 'active',
      tcvCents: 10_000_000,
      baselineCostCents: 6_000_000,
      forecastCostCents: 6_500_000,
      baselineMarginBps: 4_000,
      forecastMarginBps: 3_500,
      marginVarianceBps: -500,
      costVarianceCents: 500_000,
      permitExposureCount: 2,
      permitOverdueCount: 1,
      unsignedVoExposureCents: 125_000,
      hasApprovedBom: true,
      hasApprovedBudget: true,
    },
  ],
  slaBreachesByBu: [{ businessUnit: 'Construction', breachCount: 3 }],
  totals: {
    permitExposureCount: 2,
    permitOverdueCount: 1,
    unsignedVoExposureCents: 125_000,
    slaBreachCount: 3,
  },
}

describe('ManagementHealth', () => {
  it('renders project margin and exposure signals for a Monday meeting', () => {
    const markup = renderToStaticMarkup(<ManagementHealth data={data} />)

    expect(markup).toContain('Project margin &amp; exposure')
    expect(markup).toContain('Harbor Office')
    expect(markup).toContain('Margin Delta')
    expect(markup).toContain('Unsigned VO')
    expect(markup).toContain('Construction')
    expect(markup).toContain('Unsigned VO exposure')
    expect(markup).toContain('management-health__bad')
    expect(markup).toContain('management-health__warning')
  })

  it('renders a truthful empty state when no active projects or breaches exist', () => {
    const markup = renderToStaticMarkup(
      <ManagementHealth
        data={{
          projectMargins: [],
          slaBreachesByBu: [],
          totals: {
            permitExposureCount: 0,
            permitOverdueCount: 0,
            unsignedVoExposureCents: 0,
            slaBreachCount: 0,
          },
        }}
      />
    )

    expect(markup).toContain('No active or on-hold projects to review.')
    expect(markup).toContain('No breached or overdue clocks.')
    expect(markup).not.toContain('Unsigned VO exposure')
  })
})
