import { describe, expect, it } from 'vitest'

import { parseDashboardFilters } from './dashboard-filters'

describe('dashboard filters', () => {
  it('turns URL values into bounded closing-date and representative filters', () => {
    const result = parseDashboardFilters({
      since: '2026-08-01',
      until: '2026-08-31',
      rep: '11111111-1111-4111-8111-111111111111',
    })

    expect(result).toEqual({
      filters: {
        since: new Date('2026-08-01T00:00:00.000Z'),
        until: new Date('2026-08-31T23:59:59.999Z'),
        repId: '11111111-1111-4111-8111-111111111111',
      },
      errors: [],
    })
  })

  it('rejects malformed URL filters instead of applying a partial query', () => {
    const result = parseDashboardFilters({
      since: 'not-a-date',
      until: '2026-08-01',
      rep: 'not-a-uuid',
    })

    expect(result.filters).toEqual({})
    expect(result.errors).toEqual([
      'Closing date filters must use YYYY-MM-DD.',
      'Sales representative filter is invalid.',
    ])
  })
})
