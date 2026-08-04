import { describe, expect, it } from 'vitest'
import {
  activeCommandPaletteIndex,
  nextCommandPaletteIndex,
} from './command-palette-navigation'

describe('command palette navigation', () => {
  it('starts at the first option and wraps forward', () => {
    expect(nextCommandPaletteIndex(-1, 3, 1)).toBe(0)
    expect(nextCommandPaletteIndex(2, 3, 1)).toBe(0)
  })

  it('wraps backward from the first option', () => {
    expect(nextCommandPaletteIndex(0, 3, -1)).toBe(2)
    expect(nextCommandPaletteIndex(-1, 3, -1)).toBe(2)
  })

  it('returns no active option for an empty or invalid list', () => {
    expect(nextCommandPaletteIndex(0, 0, 1)).toBe(-1)
    expect(activeCommandPaletteIndex(-1, 3)).toBe(-1)
    expect(activeCommandPaletteIndex(3, 3)).toBe(-1)
    expect(activeCommandPaletteIndex(1, 3)).toBe(1)
  })
})
