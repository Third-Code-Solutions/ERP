import { describe, expect, it } from 'vitest'
import { resolveWonOpportunityProjectName } from './won-conversion'

describe('resolveWonOpportunityProjectName', () => {
  it('prefers the Sales prospective project name for a canonical won opportunity', () => {
    expect(
      resolveWonOpportunityProjectName({
        stage: 'won',
        prospectiveProjectName: 'Makati office fit-out',
        opportunityType: 'Fit-out',
        accountName: 'Acme Properties',
      })
    ).toBe('Makati office fit-out')
  })

  it('accepts a legacy closed-won opportunity and falls back compatibly', () => {
    expect(
      resolveWonOpportunityProjectName({
        stage: 'closed_won',
        prospectiveProjectName: null,
        opportunityType: 'Warehouse upgrade',
        accountName: 'Acme Properties',
      })
    ).toBe('Warehouse upgrade')
  })
})
