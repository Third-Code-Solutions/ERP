import { describe, expect, it } from 'vitest'
import {
  cortexGraphQuerySchema,
  cortexGraphRefTableMatchesType,
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
})
