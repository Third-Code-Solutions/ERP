import { describe, expect, it } from 'vitest'
import { datetimeRegex } from 'zod/v3'
import { ISO_DATETIME_OFFSET, ISO_DATETIME_UTC, isoDateTimeString } from '../iso-datetime'

describe('isoDateTimeString', () => {
  it('uses the exact zod 3 datetime patterns', () => {
    expect(ISO_DATETIME_OFFSET.source).toBe(datetimeRegex({ offset: true, precision: null, local: false }).source)
    expect(ISO_DATETIME_UTC.source).toBe(datetimeRegex({ offset: false, precision: null, local: false }).source)
  })

  it('accepts what zod 3 accepted, including forms zod 4 rejects', () => {
    const withOffset = isoDateTimeString({ offset: true })
    for (const value of ['2026-11-24T09:00:00.123Z', '2026-11-24T09:00:00+08:00', '2026-11-24T09:00+08:00', '2026-11-24T09:00:00+0800']) {
      expect(withOffset.safeParse(value).success, value).toBe(true)
    }
    expect(isoDateTimeString().safeParse('2026-11-24T09:00Z').success).toBe(true)
  })

  it('rejects offsets without the option, non-ISO text and impossible dates', () => {
    expect(isoDateTimeString().safeParse('2026-11-24T09:00:00+08:00').success).toBe(false)
    const withOffset = isoDateTimeString({ offset: true, message: 'Pick a time' })
    for (const value of ['2026-11-24 09:00:00Z', '2026-11-24', '2026-02-30T09:00:00Z', '2026-11-24T09:00:00']) {
      expect(withOffset.safeParse(value).success, value).toBe(false)
    }
    expect(withOffset.safeParse('nope').error?.issues[0]?.message).toBe('Pick a time')
  })
})
