import { describe, expect, it } from 'vitest'

import { parseBomLocationPrefix } from '../location'

describe('parseBomLocationPrefix', () => {
  it.each(['Entrance Hall — Vinyl Plank Flooring', 'Entrance Hall – Vinyl Plank Flooring', 'Entrance Hall - Vinyl Plank Flooring'])(
    'parses %s',
    (description) => {
      expect(parseBomLocationPrefix(description)).toEqual({
        locationName: 'Entrance Hall',
        itemDescription: 'Vinyl Plank Flooring',
      })
    },
  )

  it('trims the source while preserving the semantic item text', () => {
    expect(parseBomLocationPrefix('  GM Office —  LED panel  ')).toEqual({
      locationName: 'GM Office',
      itemDescription: 'LED panel',
    })
  })

  it.each([null, undefined, '', 'Vinyl Plank Flooring', '— Flooring', 'Room — '])(
    'queues an unparseable description: %s',
    (description) => {
      expect(parseBomLocationPrefix(description)).toBeNull()
    },
  )
})
