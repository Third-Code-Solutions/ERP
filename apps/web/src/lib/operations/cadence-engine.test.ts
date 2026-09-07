import { describe, expect, it, vi } from 'vitest'
vi.mock('@third-code-erp/database', () => ({ db: {} }))
import { manilaBoundaries, manilaCalendarDate } from './cadence-engine'

describe('Manila task calendar boundaries', () => {
  it.each([
    ['2026-09-06T15:59:59.999Z', '2026-09-06'],
    ['2026-09-06T16:00:00.000Z', '2026-09-07'],
    ['2026-09-06T23:00:00.000Z', '2026-09-07'],
    ['2026-09-07T00:00:00.000Z', '2026-09-07'],
    ['2026-12-31T16:00:00.000Z', '2027-01-01'],
  ])('resolves %s to local day %s', (instant, day) => {
    const date = new Date(instant)
    expect(manilaCalendarDate(date).toISOString()).toBe(`${day}T00:00:00.000Z`)
    expect(manilaBoundaries.startOfDay(date).toISOString()).toBe(
      new Date(`${day}T00:00:00.000+08:00`).toISOString()
    )
    expect(manilaBoundaries.endOfDay(date).toISOString()).toBe(
      new Date(`${day}T23:59:59.999+08:00`).toISOString()
    )
    expect(manilaBoundaries.atHour(date, 8).toISOString()).toBe(`${day}T00:00:00.000Z`)
  })
})
