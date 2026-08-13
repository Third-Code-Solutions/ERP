import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cortexChatRetrievalReadsUseCoreApi: vi.fn(),
  getCortexChatRetrievalThroughCoreApi: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  cortexChatRetrievalReadsUseCoreApi:
    mocks.cortexChatRetrievalReadsUseCoreApi,
  getCortexChatRetrievalThroughCoreApi:
    mocks.getCortexChatRetrievalThroughCoreApi,
}))

import { readCortexChatRetrievalThroughCore } from './chat-retrieval-read'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const QUERY = { query: 'Concrete Tower', recentLimit: 40, matchLimit: 12 }

describe('readCortexChatRetrievalThroughCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cortexChatRetrievalReadsUseCoreApi.mockReturnValue(false)
  })

  it('fails closed for an unselected tenant without touching Core or database', async () => {
    await expect(
      readCortexChatRetrievalThroughCore({ tenantId: TENANT_ID, query: QUERY })
    ).resolves.toEqual({
      ok: false,
      source: 'core',
      status: 503,
      error: 'Cortex chat retrieval Core reads are not enabled for this tenant.',
    })
    expect(mocks.getCortexChatRetrievalThroughCoreApi).not.toHaveBeenCalled()
  })

  it('returns the strict Core result for an exact selected tenant', async () => {
    const retrieval = {
      generatedAt: '2026-08-09T00:00:00.000Z',
      stats: { nodes: 0, edges: 0, provenance: 0, byType: [] },
      recent: [],
      matches: [],
      focused: null,
      keywordAnswer: { answer: '', citations: [] },
      semanticStatus: 'not_migrated',
    } as const
    mocks.cortexChatRetrievalReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexChatRetrievalThroughCoreApi.mockResolvedValue({
      ok: true,
      data: retrieval,
    })

    await expect(
      readCortexChatRetrievalThroughCore({ tenantId: TENANT_ID, query: QUERY })
    ).resolves.toEqual({ ok: true, source: 'core', retrieval })
    expect(mocks.getCortexChatRetrievalThroughCoreApi).toHaveBeenCalledWith(
      QUERY
    )
  })

  it('does not fall back when selected Core retrieval fails', async () => {
    mocks.cortexChatRetrievalReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexChatRetrievalThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'Core unavailable',
    })

    await expect(
      readCortexChatRetrievalThroughCore({ tenantId: TENANT_ID, query: QUERY })
    ).resolves.toEqual({
      ok: false,
      source: 'core',
      status: 503,
      error: 'Core unavailable',
    })
  })
})
