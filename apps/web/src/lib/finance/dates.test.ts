import { describe, expect, it } from 'vitest'
import {
  agingBucket,
  daysOverdue,
  isoDateSchema,
  manilaDay,
  manilaToday,
  utcDay,
  wholeDaysBetween,
} from './dates'

describe('Manila calendar day', () => {
  it('rolls over at 16:00 UTC, which is midnight in Manila', () => {
    expect(manilaToday(new Date('2026-11-17T15:59:59.999Z'))).toBe('2026-11-17')
    expect(manilaToday(new Date('2026-11-17T16:00:00.000Z'))).toBe('2026-11-18')
  })

  it('places an early-morning Manila instant on the Manila day, not the UTC day', () => {
    expect(manilaDay(new Date('2026-12-31T20:30:00.000Z'))).toBe('2027-01-01')
  })

  it('reads a UTC-midnight due date on its stored calendar day', () => {
    expect(utcDay(new Date('2026-12-01T00:00:00.000Z'))).toBe('2026-12-01')
  })
})

describe('isoDateSchema', () => {
  it.each(['2026-11-17', '2028-02-29'])('accepts %s', (value) => {
    expect(isoDateSchema.safeParse(value).success).toBe(true)
  })

  it.each(['2026-02-30', '2026-13-01', '2026-8-06', '17/11/2026', '', '2026-11-17T00:00:00Z'])(
    'rejects %j',
    (value) => {
      expect(isoDateSchema.safeParse(value).success).toBe(false)
    }
  )
})

describe('aging', () => {
  it('counts whole days across a month and leap-day boundary', () => {
    expect(wholeDaysBetween('2026-11-17', '2026-11-17')).toBe(0)
    expect(wholeDaysBetween('2026-10-31', '2026-11-17')).toBe(17)
    expect(wholeDaysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(wholeDaysBetween('2026-11-20', '2026-11-17')).toBe(-3)
  })

  it('never reports negative overdue days and treats no due date as not overdue', () => {
    expect(daysOverdue('2026-11-20', '2026-11-17')).toBe(0)
    expect(daysOverdue('2026-11-10', '2026-11-17')).toBe(7)
    expect(daysOverdue(null, '2026-11-17')).toBe(0)
  })

  it.each([
    [-5, 'Current'],
    [0, 'Current'],
    [1, '1-30'],
    [30, '1-30'],
    [31, '31-60'],
    [60, '31-60'],
    [61, '61-90'],
    [90, '61-90'],
    [91, '91+'],
    [400, '91+'],
  ])('puts %d days overdue in %s', (days, bucket) => {
    expect(agingBucket(days)).toBe(bucket)
  })
})
