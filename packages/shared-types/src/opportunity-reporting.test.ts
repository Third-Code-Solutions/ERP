import { describe, expect, it } from 'vitest'
import { manilaCalendarDate } from './common'
import {
  ACTIVE_OPPORTUNITY_STAGES,
  WON_OPPORTUNITY_STAGES,
  LOST_OPPORTUNITY_STAGES,
  LEAD_OPPORTUNITY_STAGES,
  opportunityStageValues,
} from './opportunities'

describe('opportunity reporting', () => {
  it('counts every persisted stage in exactly one active or terminal group', () => {
    const groups = [...ACTIVE_OPPORTUNITY_STAGES, ...WON_OPPORTUNITY_STAGES, ...LOST_OPPORTUNITY_STAGES]
    expect(new Set(groups).size).toBe(opportunityStageValues.length)
    expect(groups).toHaveLength(opportunityStageValues.length)
    expect(ACTIVE_OPPORTUNITY_STAGES).toEqual(expect.arrayContaining(['lead', 'site_survey', 'design', 'contract']))
    expect(WON_OPPORTUNITY_STAGES).toEqual(['closed_won', 'won'])
    expect(LOST_OPPORTUNITY_STAGES).toEqual(['closed_lost', 'lost'])
    expect(LEAD_OPPORTUNITY_STAGES).toEqual(['opportunity_creation', 'lead'])
  })

  it('retains the submitted Manila date across UTC and year boundaries', () => {
    expect(manilaCalendarDate('2026-10-16T00:00:00+08:00')).toBe('2026-10-16')
    expect(manilaCalendarDate(new Date('2026-10-15T16:00:00Z'))).toBe('2026-10-16')
    expect(manilaCalendarDate('2026-12-31T16:00:00Z')).toBe('2027-01-01')
    expect(manilaCalendarDate('2026-10-16')).toBe('2026-10-16')
  })
})
