import { describe, expect, it } from 'vitest'
import {
  canUniversalSearchEntity,
  universalSearchHitSchema,
  universalSearchQuerySchema,
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

  it('keeps the canonical role matrix aligned across authorities', () => {
    expect(canUniversalSearchEntity('owner', 'journal_entry')).toBe(true)
    expect(canUniversalSearchEntity('pm', 'delivery')).toBe(true)
    expect(canUniversalSearchEntity('estimator', 'bom')).toBe(true)
    expect(canUniversalSearchEntity('procurement', 'vendor')).toBe(true)
    expect(canUniversalSearchEntity('procurement', 'material')).toBe(true)
    expect(canUniversalSearchEntity('finance', 'vendor')).toBe(false)
    expect(canUniversalSearchEntity('sales', 'material')).toBe(false)
    expect(canUniversalSearchEntity('viewer', 'invoice')).toBe(false)
    expect(canUniversalSearchEntity('sales', 'ledger_account')).toBe(false)
    expect(canUniversalSearchEntity('cx', 'warranty')).toBe(true)
  })

  it('bounds and normalizes Core query input', () => {
    expect(
      universalSearchQuerySchema.parse({ q: '  concrete  ' })
    ).toEqual({ q: 'concrete', limit: 80 })
    expect(() => universalSearchQuerySchema.parse({ q: 'x' })).toThrow()
    expect(() =>
      universalSearchQuerySchema.parse({ q: 'concrete', limit: 81 })
    ).toThrow()
  })
})
