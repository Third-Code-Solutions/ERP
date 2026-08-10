import { describe, expect, it } from 'vitest'
import { TodayPipe } from './today.pipe'

describe('TodayPipe', () => {
  it('normalizes the optional project context flag', () => {
    expect(new TodayPipe().transform({})).toEqual({ includeProjects: false })
    expect(new TodayPipe().transform({ includeProjects: 'true' })).toEqual({
      includeProjects: true,
    })
  })

  it('rejects browser-controlled time or unknown fields', () => {
    expect(() => new TodayPipe().transform({ asOf: '2026-08-10' })).toThrow(
      'Invalid Today query'
    )
  })
})
