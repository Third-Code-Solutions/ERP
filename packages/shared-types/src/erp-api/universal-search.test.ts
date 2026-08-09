import { describe, expect, it } from 'vitest'
import {
  universalSearchHitSchema,
  universalSearchResultSchema,
} from './universal-search'

const HIT = {
  type: 'project' as const,
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Harbor fit-out',
  subtitle: 'active',
  href: '/projects/33333333-3333-4333-8333-333333333333',
}

describe('universal search contract', () => {
  it('accepts navigation-safe complete and partial results', () => {
    expect(
      universalSearchResultSchema.parse({
        hits: [HIT],
        status: 'complete',
        failedTypes: [],
      })
    ).toMatchObject({ status: 'complete', failedTypes: [] })

    expect(
      universalSearchResultSchema.parse({
        hits: [],
        status: 'partial',
        failedTypes: ['invoice', 'journal_entry'],
      })
    ).toMatchObject({ status: 'partial', failedTypes: ['invoice', 'journal_entry'] })
  })

  it('rejects external navigation and diagnostic leakage', () => {
    expect(() =>
      universalSearchHitSchema.parse({ ...HIT, href: 'https://example.com' })
    ).toThrow()
    expect(() =>
      universalSearchResultSchema.parse({
        hits: [HIT],
        status: 'complete',
        failedTypes: [],
        queryPlan: 'tenant bypass',
      })
    ).toThrow()
  })
})
