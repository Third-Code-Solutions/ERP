import { describe, expect, it } from 'vitest'
import {
  cortexChatRetrievalQuerySchema,
  cortexChatRetrievalResultSchema,
} from './cortex-chat-retrieval'

const NODE_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'

describe('Cortex chat retrieval contract', () => {
  it('defaults and bounds retrieval windows', () => {
    expect(cortexChatRetrievalQuerySchema.parse({ query: 'invoice' })).toEqual({
      query: 'invoice',
      recentLimit: 40,
      matchLimit: 12,
    })
    expect(
      cortexChatRetrievalQuerySchema.parse({
        query: '  invoice  ',
        focus: { refTable: 'invoices', refId: REF_ID },
        recentLimit: 1,
        matchLimit: 12,
      })
    ).toMatchObject({ query: 'invoice', focus: { refTable: 'invoices' } })
    expect(
      cortexChatRetrievalQuerySchema.parse({
        query: 'invoice',
        focus: JSON.stringify({ refTable: 'invoices', refId: REF_ID }),
      })
    ).toMatchObject({ query: 'invoice', focus: { refId: REF_ID } })
    expect(() =>
      cortexChatRetrievalQuerySchema.parse({ query: 'x', recentLimit: 41 })
    ).toThrow()
    expect(() =>
      cortexChatRetrievalQuerySchema.parse({
        query: 'x',
        matchLimit: 13,
        tenantId: 'not-allowed',
      })
    ).toThrow()
  })

  it('requires a canonical focus reference when focus is supplied', () => {
    expect(() =>
      cortexChatRetrievalQuerySchema.parse({
        query: 'invoice',
        focus: { refTable: 'unknown', refId: REF_ID },
      })
    ).toThrow()
    expect(() =>
      cortexChatRetrievalQuerySchema.parse({
        query: 'invoice',
        focus: { refTable: 'invoices', refId: 'not-a-uuid' },
      })
    ).toThrow()
  })

  it('accepts only the bounded source-backed projection', () => {
    expect(
      cortexChatRetrievalResultSchema.parse({
        generatedAt: '2026-08-09T00:00:00.000Z',
        stats: { nodes: 1, edges: 0, provenance: 1, byType: [] },
        recent: [
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
        matches: [],
        focused: { found: false, summary: '', citations: [] },
        keywordAnswer: { answer: 'No matching records.', citations: [] },
        semanticStatus: 'not_migrated',
      })
    ).toMatchObject({ recent: [{ id: NODE_ID }], semanticStatus: 'not_migrated' })
  })

  it('rejects retrieval items whose source table disagrees with node type', () => {
    expect(() =>
      cortexChatRetrievalResultSchema.parse({
        generatedAt: '2026-08-09T00:00:00.000Z',
        stats: { nodes: 0, edges: 0, provenance: 0, byType: [] },
        recent: [
          {
            id: NODE_ID,
            nodeType: 'project',
            title: 'Wrong source',
            summary: null,
            refTable: 'invoices',
            refId: REF_ID,
            projectId: null,
            freshness: 'fresh',
            recordedAt: '2026-08-08T23:00:00.000Z',
            source: 'cortex',
          },
        ],
        matches: [],
        focused: null,
        keywordAnswer: { answer: '', citations: [] },
        semanticStatus: 'not_migrated',
      })
    ).toThrow()
  })

  it('rejects provider and tenant-control fields', () => {
    expect(() =>
      cortexChatRetrievalResultSchema.parse({
        generatedAt: '2026-08-09T00:00:00.000Z',
        stats: { nodes: 0, edges: 0, provenance: 0, byType: [] },
        recent: [],
        matches: [],
        focused: null,
        keywordAnswer: { answer: '', citations: [] },
        semanticStatus: 'not_migrated',
        tenantId: 'not-allowed',
        provider: 'openai',
      })
    ).toThrow()
  })
})
