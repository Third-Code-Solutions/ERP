import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cortexConversationContextReadsUseCoreApi: vi.fn(),
  getCortexConversationContextThroughCoreApi: vi.fn(),
}))

vi.mock('@/lib/erp-core-client', () => ({
  cortexConversationContextReadsUseCoreApi:
    mocks.cortexConversationContextReadsUseCoreApi,
  getCortexConversationContextThroughCoreApi:
    mocks.getCortexConversationContextThroughCoreApi,
}))

import { readCortexConversationContextThroughCore } from './conversation-context-read'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const REF_ID = '44444444-4444-4444-8444-444444444444'
const QUERY = {
  conversationId: CONVERSATION_ID,
  context: { refTable: 'projects' as const, refId: REF_ID },
}

describe('readCortexConversationContextThroughCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cortexConversationContextReadsUseCoreApi.mockReturnValue(false)
  })

  it('fails closed for an unselected tenant without touching Core or database', async () => {
    await expect(
      readCortexConversationContextThroughCore({ tenantId: TENANT_ID, query: QUERY })
    ).resolves.toEqual({
      ok: false,
      source: 'core',
      status: 503,
      error:
        'Cortex conversation context Core reads are not enabled for this tenant.',
    })
    expect(mocks.getCortexConversationContextThroughCoreApi).not.toHaveBeenCalled()
  })

  it('returns the strict Core owner/context resolution', async () => {
    const resolution = { conversationId: CONVERSATION_ID, context: null }
    mocks.cortexConversationContextReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexConversationContextThroughCoreApi.mockResolvedValue({
      ok: true,
      data: resolution,
    })

    await expect(
      readCortexConversationContextThroughCore({ tenantId: TENANT_ID, query: QUERY })
    ).resolves.toEqual({ ok: true, source: 'core', resolution })
    expect(mocks.getCortexConversationContextThroughCoreApi).toHaveBeenCalledWith(
      QUERY
    )
  })

  it('preserves Core 404/409 semantics and never falls back on selected failure', async () => {
    mocks.cortexConversationContextReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexConversationContextThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 409,
      error: 'Conversation context mismatch',
    })

    await expect(
      readCortexConversationContextThroughCore({ tenantId: TENANT_ID, query: QUERY })
    ).resolves.toEqual({
      ok: false,
      source: 'core',
      status: 409,
      error: 'Conversation context mismatch',
    })
    expect(mocks.getCortexConversationContextThroughCoreApi).toHaveBeenCalledTimes(1)
  })

  it('maps a selected Core timeout to 503 without retry or legacy fallback', async () => {
    mocks.cortexConversationContextReadsUseCoreApi.mockReturnValue(true)
    mocks.getCortexConversationContextThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'Cortex conversation context service is unavailable.',
    })

    await expect(
      readCortexConversationContextThroughCore({ tenantId: TENANT_ID, query: QUERY })
    ).resolves.toEqual({
      ok: false,
      source: 'core',
      status: 503,
      error: 'Cortex conversation context service is unavailable.',
    })
    expect(mocks.getCortexConversationContextThroughCoreApi).toHaveBeenCalledTimes(1)
  })
})
