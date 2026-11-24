import { describe, expect, it } from 'vitest'
import {
  calendarDaysBetween,
  formatManilaDate,
  formatManilaDateTime,
  manilaToday,
} from './manila-date'

describe('formatManilaDate', () => {
  it('shows the Manila calendar day, not the UTC one', () => {
    const lateUtc = new Date('2026-11-16T20:15:00Z')
    expect(formatManilaDate(lateUtc)).toBe(
      new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date('2026-11-17T00:00:00Z')
      )
    )
  })
})

describe('manilaToday', () => {
  it('is already the next day at 16:00 UTC (00:00 Manila)', () => {
    expect(manilaToday(new Date('2026-11-16T16:00:00Z'))).toBe('2026-11-17')
  })

  it('is still the same day one minute before Manila midnight', () => {
    expect(manilaToday(new Date('2026-11-16T15:59:00Z'))).toBe('2026-11-16')
  })

  it('differs from the UTC date before 08:00 Manila', () => {
    const instant = new Date('2026-03-01T23:30:00Z')
    expect(instant.toISOString().slice(0, 10)).toBe('2026-03-01')
    expect(manilaToday(instant)).toBe('2026-03-02')
  })

  it('rolls over a year end', () => {
    expect(manilaToday(new Date('2026-12-31T16:30:00Z'))).toBe('2027-01-01')
  })
})

describe('calendarDaysBetween', () => {
  it('counts whole calendar days across a month end', () => {
    expect(calendarDaysBetween('2026-03-02', '2026-02-27')).toBe(3)
  })

  it('is negative when the first date is earlier', () => {
    expect(calendarDaysBetween('2026-11-10', '2026-11-17')).toBe(-7)
  })
})

describe('formatManilaDateTime', () => {
  it('renders the Manila wall-clock day for a late-UTC instant', () => {
    expect(formatManilaDateTime(new Date('2026-11-16T20:15:00Z'))).toContain(
      '17'
    )
  })
})
