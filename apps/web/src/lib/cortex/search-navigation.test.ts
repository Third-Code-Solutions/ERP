import { describe, expect, it } from 'vitest'
import { activeCortexSearchIndex, nextCortexSearchIndex } from './search-navigation'

const hits = [{ href: '/projects/one' }, { href: null }, { href: '/projects/two' }]

describe('Cortex search navigation', () => {
  it('starts at the first actionable hit and skips unavailable records', () => {
    expect(nextCortexSearchIndex(-1, hits, 1)).toBe(0)
    expect(nextCortexSearchIndex(0, hits, 1)).toBe(2)
  })

  it('wraps backwards and forwards across actionable hits', () => {
    expect(nextCortexSearchIndex(2, hits, 1)).toBe(0)
    expect(nextCortexSearchIndex(0, hits, -1)).toBe(2)
  })

  it('rejects an unavailable active index', () => {
    expect(activeCortexSearchIndex(1, hits)).toBe(-1)
    expect(activeCortexSearchIndex(2, hits)).toBe(2)
    expect(nextCortexSearchIndex(-1, [{ href: null }], 1)).toBe(-1)
  })
})
