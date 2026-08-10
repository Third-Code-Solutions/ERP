import { describe, expect, it } from 'vitest'
import { manilaTodayBoundaries } from './today-boundaries'

describe('Manila Today boundaries', () => {
  it('uses the Manila calendar date and UTC+8 cutover', () => {
    const { startOfDay, endOfDay } = manilaTodayBoundaries(
      new Date('2026-08-10T00:30:00.000Z')
    )

    expect(startOfDay.toISOString()).toBe('2026-08-09T16:00:00.000Z')
    expect(endOfDay.toISOString()).toBe('2026-08-10T15:59:59.999Z')
  })
})
