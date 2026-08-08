import { describe, expect, it } from 'vitest'
import {
  cortexSearchQuerySchema,
  cortexSearchResultSchema,
  cortexSearchTerms,
} from './cortex-search'

describe('Cortex search contract', () => {
  it('normalizes bounded literal terms', () => {
    expect(cortexSearchTerms('  Concrete_% Tower / slab  ')).toEqual([
      'concrete',
      'tower',
      'slab',
    ])
    expect(cortexSearchTerms('a be ! @')).toEqual([])
  })

  it('defaults and bounds the query limit', () => {
    expect(cortexSearchQuerySchema.parse({ q: 'concrete' })).toEqual({
      q: 'concrete',
      limit: 20,
    })
    expect(() =>
      cortexSearchQuerySchema.parse({ q: 'concrete', limit: 21 })
    ).toThrow()
    expect(() =>
      cortexSearchQuerySchema.parse({ q: 'concrete', tenantId: 'bad' })
    ).toThrow()
  })

  it('rejects malformed cross-tenant or untyped results', () => {
    expect(() =>
      cortexSearchResultSchema.parse({
        hits: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            nodeType: 'invoice',
            title: 'Invoice',
            summary: null,
            refTable: 'invoices',
            refId: '44444444-4444-4444-8444-444444444444',
            projectId: null,
            freshness: 'fresh',
            source: 'wrong-source',
          },
        ],
      })
    ).toThrow()
  })

  it('rejects process-scoped observability fields from a user-facing result', () => {
    expect(() =>
      cortexSearchResultSchema.parse({
        scope: 'process',
        metric: 'cortex_provider_circuit_alert_enqueue_total',
        counters: { 'post_commit.enqueued': 1 },
        hits: [],
      })
    ).toThrow()
  })
})
