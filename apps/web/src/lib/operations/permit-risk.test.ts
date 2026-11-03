import { describe, expect, it } from 'vitest'

import { permitDaysOverdue } from './permit-risk'

const NOW = Date.parse('2026-11-03T04:00:00Z')

describe('permitDaysOverdue', () => {
  it('counts whole days past the expected return for open permits', () => {
    expect(permitDaysOverdue('under_review', '2026-10-31T04:00:00Z', NOW)).toBe(3)
    expect(permitDaysOverdue('submitted', '2026-11-10T00:00:00Z', NOW)).toBe(0)
  })

  it('never reports a closed or unforecast permit as overdue', () => {
    expect(permitDaysOverdue('approved', '2026-10-01T00:00:00Z', NOW)).toBeNull()
    expect(permitDaysOverdue('cancelled', '2026-10-01T00:00:00Z', NOW)).toBeNull()
    expect(permitDaysOverdue('submitted', null, NOW)).toBeNull()
  })
})
