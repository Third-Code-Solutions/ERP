import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCortexNodeByRef: vi.fn(),
  getCortexCitationNodesByIds: vi.fn(),
  getCortexNeighbors: vi.fn(),
  getCortexProvenance: vi.fn(),
  searchCortexNodesByTerms: vi.fn(),
  searchCortexNodes: vi.fn(),
}))

vi.mock('./graph', () => mocks)

import { cortexKeywordAnswer } from './retrieve'

const SAFE_NODE = {
  id: '33333333-3333-4333-8333-333333333333',
  node_type: 'invoice',
  ref_table: 'invoices',
  ref_id: '44444444-4444-4444-8444-444444444444',
  title: 'Visible Invoice',
  summary: 'Safe evidence',
}

describe('Cortex keyword retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.searchCortexNodes.mockResolvedValue([])
  })

  it('omits unknown or mismatched sources from deterministic answers', async () => {
    mocks.searchCortexNodesByTerms.mockResolvedValue([
      SAFE_NODE,
      {
        ...SAFE_NODE,
        id: '55555555-5555-4555-8555-555555555555',
        node_type: 'project',
        ref_table: 'invoices',
        title: 'Hidden Mismatch',
        summary: 'Must not reach an answer',
      },
      {
        ...SAFE_NODE,
        id: '66666666-6666-4666-8666-666666666666',
        ref_table: 'secret_records',
        title: 'Unknown Source',
      },
    ])

    const result = await cortexKeywordAnswer('tenant-id', 'invoice')

    expect(result.answer).toContain('Visible Invoice')
    expect(result.answer).not.toContain('Hidden Mismatch')
    expect(result.answer).not.toContain('Unknown Source')
    expect(result.citations).toEqual([
      expect.objectContaining({
        nodeId: SAFE_NODE.id,
        nodeType: 'invoice',
        refTable: 'invoices',
      }),
    ])
  })
})
