import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCortexNodeByRef: vi.fn(),
  getCortexCitationNodesByIds: vi.fn(),
  getCortexNeighbors: vi.fn(),
  getCortexProvenance: vi.fn(),
  searchCortexNodesByTerms: vi.fn(),
  searchCortexNodesWithRelationsByTerms: vi.fn(),
  searchCortexNodes: vi.fn(),
}))

vi.mock('./graph', () => mocks)

import {
  cortexEmbeddingText,
  cortexEntitySearchTerms,
  cortexKeywordAnswer,
  isBroadCortexQuestion,
} from './retrieve'

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
    mocks.searchCortexNodesWithRelationsByTerms.mockResolvedValue([
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

  it('uses account identity terms and includes its related opportunity', async () => {
    const opportunity = {
      ...SAFE_NODE,
      id: '77777777-7777-4777-8777-777777777777',
      node_type: 'opportunity',
      ref_table: 'opportunities',
      ref_id: 'fac9f074-4acc-477e-a5ff-fc728ec8ae82',
      title: 'Design and build',
      summary: 'Stage: lead · TCV(cents): 480000000',
    }
    mocks.searchCortexNodesWithRelationsByTerms.mockResolvedValue([
      {
        ...SAFE_NODE,
        node_type: 'account',
        ref_table: 'accounts',
        title: 'DEMO — Amihan Workspace Inc.',
      },
      opportunity,
    ])

    const question =
      'Summarize the sales opportunity for DEMO — Amihan Workspace Inc. What is its current stage, contract value and next Sales action?'
    const result = await cortexKeywordAnswer('tenant-id', question, ['account', 'opportunity'])

    expect(cortexEntitySearchTerms(question)).toEqual([
      'amihan',
      'workspace',
      'inc',
    ])
    expect(mocks.searchCortexNodesWithRelationsByTerms).toHaveBeenCalledWith(
      'tenant-id',
      ['amihan', 'workspace', 'inc'],
      8,
      ['account', 'opportunity']
    )
    expect(result.answer).toContain('DEMO — Amihan Workspace Inc.')
    expect(result.answer).toContain('TCV(cents): 480000000')
    expect(result.citations.map((citation) => citation.refId)).toContain(
      'fac9f074-4acc-477e-a5ff-fc728ec8ae82'
    )
  })

  it('does not substitute unrelated recent records for a specific entity miss', async () => {
    mocks.searchCortexNodesWithRelationsByTerms.mockResolvedValue([])
    mocks.searchCortexNodes.mockResolvedValue([SAFE_NODE])

    const result = await cortexKeywordAnswer(
      'tenant-id',
      'Summarize Amihan Workspace Inc.',
      ['account', 'opportunity']
    )
    const latestMissing = await cortexKeywordAnswer(
      'tenant-id',
      'Latest stage for MissingClient',
      ['account', 'opportunity']
    )
    const activeMissing = await cortexKeywordAnswer(
      'tenant-id',
      'Active opportunities for MissingClient',
      ['account', 'opportunity']
    )

    expect(result.citations).toEqual([])
    expect(latestMissing.citations).toEqual([])
    expect(activeMissing.citations).toEqual([])
    expect(result.answer).toContain("don't have relevant context")
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
    expect(isBroadCortexQuestion('What changed recently?')).toBe(true)
    expect(isBroadCortexQuestion('Overview of recent changes')).toBe(true)
    expect(isBroadCortexQuestion('Latest stage for MissingClient')).toBe(false)
    expect(
      isBroadCortexQuestion('Active opportunities for MissingClient')
    ).toBe(false)
    expect(isBroadCortexQuestion('Summarize Amihan Workspace Inc.')).toBe(false)
  })

  it('retains recent-record fallback for a truly broad overview', async () => {
    mocks.searchCortexNodesWithRelationsByTerms.mockResolvedValue([])
    mocks.searchCortexNodes.mockResolvedValue([SAFE_NODE])

    const result = await cortexKeywordAnswer(
      'tenant-id',
      'Overview of recent changes',
      ['invoice']
    )

    expect(result.answer).toContain('most recently updated records')
    expect(result.citations).toHaveLength(1)
    expect(mocks.searchCortexNodes).toHaveBeenCalledWith('tenant-id', {
      limit: 8,
      nodeTypes: ['invoice'],
    })
  })
})

describe('Cortex embedding text', () => {
  it('redacts direct identifiers before the text leaves for the embedding provider', () => {
    const text = cortexEmbeddingText({
      node_type: 'contact',
      title: 'Reach jane@example.com',
      summary: 'TIN 123-456-789, phone +639171234567',
    })

    expect(text).toBe(
      'contact — Reach [email redacted] — [tax id redacted], phone [phone redacted]'
    )
  })

  it('truncates after redaction', () => {
    const text = cortexEmbeddingText({
      node_type: 'project',
      title: `${'a'.repeat(7_980)} jane@example.com`,
      summary: null,
    })

    expect(text.length).toBeLessThanOrEqual(8_000)
    expect(text).not.toContain('@')
  })
})
