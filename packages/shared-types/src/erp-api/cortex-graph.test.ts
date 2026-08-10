import { describe, expect, it } from 'vitest'
import {
  cortexFocusedGraphResultFromRows,
  cortexGraphQuerySchema,
  cortexGraphRefTableMatchesType,
  cortexGraphResultFromRows,
  cortexGraphResponseSchema,
  isCortexGraphRefTable,
} from './cortex-graph'

const NODE_ID = '11111111-1111-4111-8111-111111111111'
const REF_ID = '22222222-2222-4222-8222-222222222222'

describe('Cortex graph contract', () => {
  it('accepts no focus or one complete registered focus', () => {
    expect(cortexGraphQuerySchema.parse({})).toEqual({})
    expect(
      cortexGraphQuerySchema.parse({
        refTable: 'journal_entries',
        refId: REF_ID,
      })
    ).toEqual({ refTable: 'journal_entries', refId: REF_ID })

    expect(() =>
      cortexGraphQuerySchema.parse({ refTable: 'journal_entries' })
    ).toThrow()
    expect(() =>
      cortexGraphQuerySchema.parse({
        refTable: 'unregistered_records',
        refId: REF_ID,
      })
    ).toThrow()
    expect(() => cortexGraphQuerySchema.parse({ tenantId: REF_ID })).toThrow()
  })

  it('binds every registered source to its canonical node type', () => {
    expect(isCortexGraphRefTable('journal_entries')).toBe(true)
    expect(isCortexGraphRefTable('private_records')).toBe(false)
    expect(
      cortexGraphRefTableMatchesType('journal_entries', 'journal_entry')
    ).toBe(true)
    expect(cortexGraphRefTableMatchesType('journal_entries', 'invoice')).toBe(
      false
    )
  })

  it('rejects malformed, unregistered, or unbounded graph responses', () => {
    const graph = {
      focusNodeId: NODE_ID,
      nodes: [
        {
          id: NODE_ID,
          type: 'journal_entry',
          title: 'Journal 1042',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
      ],
      links: [],
    }

    expect(cortexGraphResponseSchema.parse(graph)).toEqual(graph)
    expect(() =>
      cortexGraphResponseSchema.parse({
        ...graph,
        nodes: [{ ...graph.nodes[0], refTable: 'secret_records' }],
      })
    ).toThrow()
    expect(() =>
      cortexGraphResponseSchema.parse({
        ...graph,
        nodes: [{ ...graph.nodes[0], type: 'invoice' }],
      })
    ).toThrow()
    expect(() =>
      cortexGraphResponseSchema.parse({ ...graph, tenantId: REF_ID })
    ).toThrow()
  })

  it('sanitizes malformed nodes and dangling links without losing valid graph data', () => {
    const secondNode = '33333333-3333-4333-8333-333333333333'
    const result = cortexGraphResultFromRows({
      nodes: [
        {
          id: NODE_ID,
          type: 'journal_entry',
          title: 'Journal 1042',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
        {
          id: 'not-a-uuid',
          type: 'journal_entry',
          title: 'Malformed',
          refTable: 'journal_entries',
          refId: REF_ID,
          projectId: null,
        },
        {
          id: secondNode,
          type: 'journal_entry',
          title: 'Journal 1043',
          refTable: 'journal_entries',
          refId: '44444444-4444-4444-8444-444444444444',
          projectId: null,
        },
      ],
      links: [
        { source: NODE_ID, target: secondNode, type: 'part_of' },
        { source: NODE_ID, target: '55555555-5555-4555-8555-555555555555', type: 'leak' },
        { source: 'not-a-uuid', target: secondNode, type: 'bad' },
      ],
    })

    expect(result.nodes).toHaveLength(2)
    expect(result.links).toEqual([
      { source: NODE_ID, target: secondNode, type: 'part_of' },
    ])
  })

  it('returns no focused graph when the focus row is invalid or absent', () => {
    expect(cortexFocusedGraphResultFromRows(null)).toBeNull()
    expect(
      cortexFocusedGraphResultFromRows({
        focusNodeId: NODE_ID,
        nodes: [],
        links: [],
      })
    ).toBeNull()
  })
})
