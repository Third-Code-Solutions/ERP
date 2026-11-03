import { describe, expect, it } from 'vitest'
import { manilaToday } from './manila-date'

describe('manilaToday', () => {
  it('returns the Manila date, not the UTC date, before 08:00 Manila', () => {
    // 2026-11-02T23:30Z is 07:30 on 3 Nov in Manila.
    expect(manilaToday(new Date('2026-11-02T23:30:00Z'))).toBe('2026-11-03')
  })

  it('matches the UTC date later in the Manila day', () => {
    expect(manilaToday(new Date('2026-11-03T10:00:00Z'))).toBe('2026-11-03')
  })
})
