import { describe, expect, it } from 'vitest'
import {
  commandPaletteOptionCount,
  resolveCommandPaletteSelection,
} from './command-palette-selection'

describe('command palette selection', () => {
  it('adds one Ask Cortex option after record hits', () => {
    expect(commandPaletteOptionCount(5, true)).toBe(6)
    expect(commandPaletteOptionCount(5, false)).toBe(5)
  })

  it('keeps record hits first', () => {
    expect(resolveCommandPaletteSelection(0, 2, true)).toEqual({
      kind: 'hit',
      index: 0,
    })
    expect(resolveCommandPaletteSelection(1, 2, true)).toEqual({
      kind: 'hit',
      index: 1,
    })
  })

  it('places Ask Cortex after the final record', () => {
    expect(resolveCommandPaletteSelection(2, 2, true)).toEqual({
      kind: 'ask-cortex',
    })
    expect(resolveCommandPaletteSelection(0, 0, true)).toEqual({
      kind: 'ask-cortex',
    })
  })

  it('returns no action for an invalid or empty selection', () => {
    expect(resolveCommandPaletteSelection(-1, 2, true)).toBeNull()
    expect(resolveCommandPaletteSelection(2, 2, false)).toBeNull()
    expect(resolveCommandPaletteSelection(0, 0, false)).toBeNull()
  })
})
