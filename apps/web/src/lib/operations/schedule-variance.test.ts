import { describe, expect, it } from 'vitest'
import { computeScheduleVariance } from './schedule-variance'

describe('computeScheduleVariance', () => {
  it('treats flat 0% mobilization weeks as on schedule', () => {
    expect(computeScheduleVariance([0, 0, 0, 10, 30], [0, 0, 0])).toEqual({ label: 'On schedule', tone: 'success' })
  })

  it('reports behind when actual matches an earlier planned week', () => {
    expect(computeScheduleVariance([10, 20, 30, 40], [10, 15, 20, 20])).toEqual({ label: '14 days behind', tone: 'danger' })
  })

  it('reports ahead when actual reaches a later planned week', () => {
    expect(computeScheduleVariance([10, 20, 30, 40], [15, 30])).toEqual({ label: '7 days ahead', tone: 'success' })
  })

  it('returns null without curves', () => {
    expect(computeScheduleVariance([], [10])).toBeNull()
  })
})
