import { describe, expect, it, vi } from 'vitest'

vi.mock('@third-code-erp/database', () => ({ db: {} }))

import { cumulativeVoImpact } from './queries'

describe('cumulativeVoImpact', () => {
  it('leaves draft and rejected VOs out of the cumulative change', () => {
    const totals = cumulativeVoImpact([
      { status: 'draft', cost_impact_cents: 10_000_00, time_impact_days: 9 },
      { status: 'rejected', cost_impact_cents: 500_000_00, time_impact_days: 30 },
      { status: 'pending_commercial_pricing', cost_impact_cents: 2_000_00, time_impact_days: 2 },
      { status: 'pending_client_signature', cost_impact_cents: 3_000_00, time_impact_days: 3 },
      { status: 'signed', cost_impact_cents: -1_000_00, time_impact_days: -1 },
    ])

    expect(totals).toEqual({ cost_impact_cents: 4_000_00, time_impact_days: 4 })
  })

  it('is zero when nothing counts yet', () => {
    expect(
      cumulativeVoImpact([{ status: 'draft', cost_impact_cents: 100, time_impact_days: 1 }])
    ).toEqual({ cost_impact_cents: 0, time_impact_days: 0 })
    expect(cumulativeVoImpact([])).toEqual({ cost_impact_cents: 0, time_impact_days: 0 })
  })
})
