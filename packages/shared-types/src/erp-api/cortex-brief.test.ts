import { describe, expect, it } from 'vitest'
import {
  cortexBriefQuerySchema,
  cortexBriefResultSchema,
} from './cortex-brief'

const NODE_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'

describe('Cortex brief contract', () => {
  it('defaults and bounds the read limit', () => {
    expect(cortexBriefQuerySchema.parse({})).toEqual({ limit: 12 })
    expect(cortexBriefQuerySchema.parse({ limit: 24 })).toEqual({ limit: 24 })
    expect(() => cortexBriefQuerySchema.parse({ limit: 25 })).toThrow()
    expect(() => cortexBriefQuerySchema.parse({ tenantId: 'bad' })).toThrow()
  })

  it('accepts a strict, source-backed brief projection', () => {
    expect(
      cortexBriefResultSchema.parse({
        generatedAt: '2026-08-09T00:00:00.000Z',
        stats: {
          nodes: 1,
          edges: 0,
          provenance: 1,
          byType: [{ nodeType: 'invoice', count: 1 }],
        },
        freshness: { fresh: 1, stale: 0, unknown: 0 },
        items: [
          {
            id: NODE_ID,
            nodeType: 'invoice',
            title: 'Invoice 1042',
            summary: null,
            refTable: 'invoices',
            refId: REF_ID,
            projectId: null,
            freshness: 'fresh',
            recordedAt: '2026-08-08T23:00:00.000Z',
            source: 'cortex',
          },
        ],
      })
    ).toMatchObject({ items: [{ id: NODE_ID }] })
  })

  it('rejects operational fields from the ERP brief response', () => {
    expect(() =>
      cortexBriefResultSchema.parse({
        generatedAt: '2026-08-09T00:00:00.000Z',
        stats: {
          nodes: 0,
          edges: 0,
          provenance: 0,
          byType: [],
        },
        freshness: { fresh: 0, stale: 0, unknown: 0 },
        items: [],
        scope: 'process',
        metric: 'cortex_provider_circuit_alert_enqueue_total',
      })
    ).toThrow()
  })
})
