import { describe, expect, it } from 'vitest'

import {
  createBusinessDayService,
  mergeBusinessDayCalendars,
  philippineBusinessDays,
  philippineHolidays,
} from '..'

describe('Philippine business-day service', () => {
  it('treats weekends and data-backed holidays as non-working days', () => {
    expect(philippineBusinessDays.isBusinessDay('2026-01-01')).toBe(false)
    expect(philippineBusinessDays.isBusinessDay('2026-01-02')).toBe(true)
    expect(philippineBusinessDays.isBusinessDay('2026-01-03')).toBe(false)
    expect(philippineHolidays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-02-17', kind: 'special_non_working' }),
      ])
    )
  })

  it('adds across a year boundary without counting the start date', () => {
    expect(philippineBusinessDays.add('2025-12-31', 1)).toBe('2026-01-02')
    expect(philippineBusinessDays.add('2026-01-02', -1)).toBe('2025-12-31')
  })

  it('skips the complete 2026 Holy Week holiday run', () => {
    expect(philippineBusinessDays.add('2026-04-01', 1)).toBe('2026-04-06')
    expect(philippineBusinessDays.between('2026-04-01', '2026-04-08')).toBe(3)
  })

  it('handles a range that starts on a holiday', () => {
    expect(philippineBusinessDays.between('2026-04-03', '2026-04-08')).toBe(2)
  })

  it('supports a runtime-maintained calendar without changing the service', () => {
    const service = createBusinessDayService({
      holidays: [
        {
          date: '2027-01-01',
          name: 'Tenant shutdown',
          kind: 'local',
          source: 'tenant calendar',
        },
      ],
    })

    expect(service.add('2026-12-31', 1)).toBe('2027-01-04')
    expect(service.between('2026-12-31', '2027-01-05')).toBe(2)
  })

  it('merges tenant rows over the national seed by date', () => {
    const calendar = mergeBusinessDayCalendars(
      { holidays: philippineHolidays },
      {
        holidays: [
          {
            date: '2026-01-01',
            name: 'Tenant shutdown override',
            kind: 'local',
            source: 'tenant calendar',
          },
          {
            date: '2027-01-04',
            name: 'Company foundation day',
            kind: 'local',
            source: 'tenant calendar',
          },
        ],
      }
    )

    expect(calendar.holidays).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2026-01-01', name: 'Tenant shutdown override' }),
        expect.objectContaining({ date: '2027-01-04', name: 'Company foundation day' }),
      ])
    )
    expect(calendar.holidays.filter((holiday) => holiday.date === '2026-01-01')).toHaveLength(1)
  })

  it('allows a tenant row to disable a seeded holiday without changing code', () => {
    const service = createBusinessDayService(
      mergeBusinessDayCalendars(
        { holidays: philippineHolidays },
        {
          holidays: [
            {
              date: '2026-01-01',
              name: "New Year's Day override",
              kind: 'local',
              source: 'tenant calendar',
              is_enabled: false,
            },
          ],
        }
      )
    )

    expect(service.isBusinessDay('2026-01-01')).toBe(true)
  })

  it('keeps CX calendar-hour clocks separate from business-day clocks', () => {
    const start = new Date('2026-04-02T10:00:00.000Z')
    expect(philippineBusinessDays.addCalendarHours(start, 48).toISOString()).toBe(
      '2026-04-04T10:00:00.000Z'
    )
  })

  it('rejects malformed dates and non-integral business-day deltas', () => {
    expect(() => philippineBusinessDays.isBusinessDay('2026-02-30')).toThrow(RangeError)
    expect(() => philippineBusinessDays.add('2026-01-02', 1.5)).toThrow(RangeError)
  })
})
