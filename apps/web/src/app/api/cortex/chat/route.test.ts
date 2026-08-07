import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getCortexConversation: vi.fn(),
  appendCortexMessage: vi.fn(),
  createCortexConversation: vi.fn(),
  searchCortexNodes: vi.fn(),
  searchCortexNodesByTerms: vi.fn(),
  cortexSemanticSearch: vi.fn(),
  getCortexGraphStats: vi.fn(),
  cortexKeywordAnswer: vi.fn(),
  cortexDescribeEntity: vi.fn(),
  authorizeCortexRecordContext: vi.fn(),
  writeAuditLog: vi.fn(),
  openaiCreate: vi.fn(),
  embedText: vi.fn(),
  cortexConversationUserTurnWritesUseCoreApi: vi.fn(),
  cortexConversationAssistantTurnWritesUseCoreApi: vi.fn(),
  cortexAssistantGenerationJobsUseCoreApi: vi.fn(),
  appendCortexConversationUserTurnThroughCoreApi: vi.fn(),
  claimCortexConversationAssistantTurnThroughCoreApi: vi.fn(),
  completeCortexConversationAssistantTurnThroughCoreApi: vi.fn(),
  startCortexAssistantGenerationJobThroughCoreApi: vi.fn(),
  getCortexAssistantGenerationJobThroughCoreApi: vi.fn(),
  cancelCortexAssistantGenerationJobThroughCoreApi: vi.fn(),
  cortexAssistantTurnIdempotencyKey: vi.fn(
    (userTurnKey: string) => `assistant-${userTurnKey}`
  ),
  consumeProviderQuotaViaCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexConversation: mocks.getCortexConversation,
  appendCortexMessage: mocks.appendCortexMessage,
  createCortexConversation: mocks.createCortexConversation,
  searchCortexNodes: mocks.searchCortexNodes,
  searchCortexNodesByTerms: mocks.searchCortexNodesByTerms,
  cortexSemanticSearch: mocks.cortexSemanticSearch,
  getCortexGraphStats: mocks.getCortexGraphStats,
  cortexKeywordAnswer: mocks.cortexKeywordAnswer,
  cortexDescribeEntity: mocks.cortexDescribeEntity,
}))

vi.mock('@third-code-erp/ai', () => ({
  embedText: mocks.embedText,
  getOpenAI: () => ({
    chat: { completions: { create: mocks.openaiCreate } },
  }),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/cortex/record-context', () => ({
  authorizeCortexRecordContext: mocks.authorizeCortexRecordContext,
}))

vi.mock('@/lib/cortex/rbac', () => ({
  cortexNodeTypeScope: vi.fn(() => null),
}))

vi.mock('@/lib/operations/nav-config', () => ({
  roleLabel: vi.fn(() => 'Admin'),
}))

vi.mock('@/lib/erp-core-client', () => ({
  cortexConversationUserTurnWritesUseCoreApi:
    mocks.cortexConversationUserTurnWritesUseCoreApi,
  cortexConversationAssistantTurnWritesUseCoreApi:
    mocks.cortexConversationAssistantTurnWritesUseCoreApi,
  cortexAssistantGenerationJobsUseCoreApi:
    mocks.cortexAssistantGenerationJobsUseCoreApi,
  appendCortexConversationUserTurnThroughCoreApi:
    mocks.appendCortexConversationUserTurnThroughCoreApi,
  claimCortexConversationAssistantTurnThroughCoreApi:
    mocks.claimCortexConversationAssistantTurnThroughCoreApi,
  completeCortexConversationAssistantTurnThroughCoreApi:
    mocks.completeCortexConversationAssistantTurnThroughCoreApi,
  startCortexAssistantGenerationJobThroughCoreApi:
    mocks.startCortexAssistantGenerationJobThroughCoreApi,
  getCortexAssistantGenerationJobThroughCoreApi:
    mocks.getCortexAssistantGenerationJobThroughCoreApi,
  cancelCortexAssistantGenerationJobThroughCoreApi:
    mocks.cancelCortexAssistantGenerationJobThroughCoreApi,
  cortexAssistantTurnIdempotencyKey:
    mocks.cortexAssistantTurnIdempotencyKey,
  consumeProviderQuotaViaCoreApi: mocks.consumeProviderQuotaViaCoreApi,
  providerQuotaUsesCoreApi: vi.fn(() => false),
}))

import { POST } from './route'
import {
  CORTEX_CITATIONS_HEADER,
  decodeCortexCitationHeader,
} from '@/lib/cortex/citation-header'

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111'
const NODE_ID = '22222222-2222-4222-8222-222222222222'
const REF_ID = '33333333-3333-4333-8333-333333333333'
const USER_MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const ASSISTANT_MESSAGE_ID = '55555555-5555-4555-8555-555555555555'
const ASSISTANT_REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const ASSISTANT_CLAIM_TOKEN = '77777777-7777-4777-8777-777777777777'
const GENERATION_JOB_ID = '88888888-8888-4888-8888-888888888888'

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  )
  expect(response.headers.get('vary')).toBe('Cookie')
}

describe('Cortex chat conversation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('OPENAI_API_KEY', '')
    mocks.getUserProfile.mockResolvedValue({
      tenantId: 'tenant-a',
      role: 'admin',
      user: { id: 'user-a' },
    })
    mocks.createCortexConversation.mockResolvedValue(CONVERSATION_ID)
    mocks.appendCortexMessage.mockResolvedValue(undefined)
    mocks.getCortexGraphStats.mockResolvedValue({ byType: [] })
    mocks.searchCortexNodes.mockResolvedValue([])
    mocks.searchCortexNodesByTerms.mockResolvedValue([])
    mocks.cortexSemanticSearch.mockResolvedValue([])
    mocks.embedText.mockResolvedValue([0.1])
    mocks.cortexKeywordAnswer.mockResolvedValue({
      answer: 'Grounded answer',
      citations: [],
    })
    mocks.cortexDescribeEntity.mockResolvedValue({
      found: false,
      summary: '',
      citations: [],
    })
    mocks.authorizeCortexRecordContext.mockResolvedValue(null)
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(false)
    mocks.cortexConversationAssistantTurnWritesUseCoreApi.mockReturnValue(false)
    mocks.cortexAssistantGenerationJobsUseCoreApi.mockReturnValue(false)
    mocks.appendCortexConversationUserTurnThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        conversationId: CONVERSATION_ID,
        messageId: USER_MESSAGE_ID,
        status: 'created',
      },
    })
    mocks.claimCortexConversationAssistantTurnThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        status: 'claimed',
        conversationId: CONVERSATION_ID,
        userMessageId: USER_MESSAGE_ID,
        requestId: ASSISTANT_REQUEST_ID,
        claimToken: ASSISTANT_CLAIM_TOKEN,
        leaseExpiresAt: '2026-08-08T00:01:00.000Z',
      },
    })
    mocks.completeCortexConversationAssistantTurnThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        status: 'created',
        conversationId: CONVERSATION_ID,
        userMessageId: USER_MESSAGE_ID,
        messageId: ASSISTANT_MESSAGE_ID,
      },
    })
    mocks.consumeProviderQuotaViaCoreApi.mockResolvedValue({
      ok: true,
      skipped: true,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a client-supplied conversation not owned by the caller', async () => {
    mocks.getCortexConversation.mockResolvedValue(null)
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: CONVERSATION_ID,
        messages: [{ role: 'user', content: 'Show my recent projects' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(404)
    expectPrivate(response)
    await expect(response.text()).resolves.toBe('Conversation not found')
    expect(mocks.getCortexConversation).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      CONVERSATION_ID
    )
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
  })

  it('binds a new conversation to one authorized canonical ERP record', async () => {
    const context = { refTable: 'projects', refId: REF_ID }
    mocks.authorizeCortexRecordContext.mockResolvedValue({
      ...context,
      nodeId: NODE_ID,
      nodeType: 'project',
      title: 'Metro MEP Retrofit',
    })
    mocks.cortexDescribeEntity.mockResolvedValue({
      found: true,
      summary: 'Metro MEP Retrofit is active.',
      citations: [],
    })
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context,
        messages: [{ role: 'user', content: 'What is its status?' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(mocks.authorizeCortexRecordContext).toHaveBeenCalledWith(
      'tenant-a',
      'admin',
      context
    )
    expect(mocks.createCortexConversation).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      'What is its status?',
      context
    )
  })

  it('rejects attempts to rebind an existing scoped conversation', async () => {
    mocks.getCortexConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      title: 'Project thread',
      context_ref_table: 'projects',
      context_ref_id: REF_ID,
      created_at: new Date(),
      updated_at: new Date(),
    })
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: CONVERSATION_ID,
        context: { refTable: 'invoices', refId: REF_ID },
        messages: [{ role: 'user', content: 'Continue' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(409)
    expectPrivate(response)
    await expect(response.text()).resolves.toBe(
      'Conversation context mismatch'
    )
    expect(mocks.authorizeCortexRecordContext).not.toHaveBeenCalled()
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
  })

  it('reauthorizes persisted record context and uses it for grounded fallback', async () => {
    const context = { refTable: 'projects', refId: REF_ID }
    const citation = {
      nodeId: NODE_ID,
      nodeType: 'project',
      refTable: 'projects',
      refId: REF_ID,
      title: 'Metro MEP Retrofit',
      projectId: REF_ID,
    }
    mocks.getCortexConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      title: 'Project thread',
      context_ref_table: context.refTable,
      context_ref_id: context.refId,
      created_at: new Date(),
      updated_at: new Date(),
    })
    mocks.authorizeCortexRecordContext.mockResolvedValue({
      ...context,
      nodeId: NODE_ID,
      nodeType: 'project',
      title: citation.title,
    })
    mocks.cortexDescribeEntity.mockResolvedValue({
      found: true,
      summary: 'Metro MEP Retrofit is active.',
      citations: [citation],
    })
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: CONVERSATION_ID,
        messages: [{ role: 'user', content: 'What changed?' }],
      }),
    })

    const response = await POST(request)

    await expect(response.text()).resolves.toBe(
      'Metro MEP Retrofit is active.'
    )
    expectPrivate(response)
    expect(mocks.authorizeCortexRecordContext).toHaveBeenCalledWith(
      'tenant-a',
      'admin',
      context
    )
    expect(mocks.createCortexConversation).not.toHaveBeenCalled()
  })

  it('hides a scoped conversation after current record access is revoked', async () => {
    mocks.getCortexConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      title: 'Revoked project thread',
      context_ref_table: 'projects',
      context_ref_id: REF_ID,
      created_at: new Date(),
      updated_at: new Date(),
    })
    mocks.authorizeCortexRecordContext.mockResolvedValue(null)
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: CONVERSATION_ID,
        messages: [{ role: 'user', content: 'Continue' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(404)
    expectPrivate(response)
    await expect(response.text()).resolves.toBe('Conversation not found')
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
  })

  it('preserves the text stream and exposes bounded grounded citations', async () => {
    const citation = {
      nodeId: NODE_ID,
      nodeType: 'project',
      refTable: 'projects',
      refId: REF_ID,
      title: 'Metro MEP Retrofit',
      projectId: REF_ID,
    }
    mocks.cortexKeywordAnswer.mockResolvedValue({
      answer: 'Grounded answer',
      citations: [citation],
    })
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)

    await expect(response.text()).resolves.toBe('Grounded answer')
    expectPrivate(response)
    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8'
    )
    expect(response.headers.get('X-Conversation-Id')).toBe(CONVERSATION_ID)
    expect(
      decodeCortexCitationHeader(
        response.headers.get(CORTEX_CITATIONS_HEADER)
      )
    ).toEqual([citation])
  })

  it('moves selected user-turn writes to Core without exposing assistant authority', async () => {
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(true)
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'browser-turn-1',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)
    await expect(response.text()).resolves.toBe('Grounded answer')

    expect(
      mocks.appendCortexConversationUserTurnThroughCoreApi
    ).toHaveBeenCalledWith(
      { content: 'Show active projects' },
      'browser-turn-1'
    )
    expect(mocks.createCortexConversation).not.toHaveBeenCalled()
    expect(mocks.appendCortexMessage).toHaveBeenCalledTimes(1)
    expect(mocks.appendCortexMessage).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      CONVERSATION_ID,
      'assistant',
      'Grounded answer',
      []
    )
  })

  it('fails closed when assistant authority is selected without Core user-turn authority', async () => {
    mocks.cortexConversationAssistantTurnWritesUseCoreApi.mockReturnValue(true)
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(503)
    expectPrivate(response)
    await expect(response.text()).resolves.toBe(
      'Cortex assistant authority requires Core user-turn authority.'
    )
    expect(
      mocks.appendCortexConversationUserTurnThroughCoreApi
    ).not.toHaveBeenCalled()
    expect(
      mocks.claimCortexConversationAssistantTurnThroughCoreApi
    ).not.toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
  })

  it('returns retry guidance without retrieval or provider spend for an active claim', async () => {
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.cortexConversationAssistantTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.claimCortexConversationAssistantTurnThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        status: 'in_progress',
        conversationId: CONVERSATION_ID,
        userMessageId: USER_MESSAGE_ID,
        retryAfterSeconds: 17,
      },
    })
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'browser-turn-in-progress',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(409)
    expect(response.headers.get('retry-after')).toBe('17')
    expectPrivate(response)
    expect(mocks.consumeProviderQuotaViaCoreApi).not.toHaveBeenCalled()
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
  })

  it('replays a completed assistant turn without retrieval or provider spend', async () => {
    const citation = {
      nodeId: NODE_ID,
      nodeType: 'project',
      refTable: 'projects',
      refId: REF_ID,
      title: 'Metro MEP Retrofit',
      projectId: REF_ID,
    }
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.cortexConversationAssistantTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.claimCortexConversationAssistantTurnThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        status: 'succeeded',
        conversationId: CONVERSATION_ID,
        userMessageId: USER_MESSAGE_ID,
        messageId: ASSISTANT_MESSAGE_ID,
        content: 'Stored grounded answer',
        citations: [citation],
        outcome: 'deterministic_grounded',
        model: 'deterministic-grounded',
      },
    })
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'browser-turn-complete',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)

    await expect(response.text()).resolves.toBe('Stored grounded answer')
    expect(response.headers.get('X-Conversation-Id')).toBe(CONVERSATION_ID)
    expect(
      decodeCortexCitationHeader(response.headers.get(CORTEX_CITATIONS_HEADER))
    ).toEqual([citation])
    expect(mocks.consumeProviderQuotaViaCoreApi).not.toHaveBeenCalled()
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
    expect(
      mocks.completeCortexConversationAssistantTurnThroughCoreApi
    ).not.toHaveBeenCalled()
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
  })

  it('completes a claimed assistant turn through Core before closing the stream', async () => {
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.cortexConversationAssistantTurnWritesUseCoreApi.mockReturnValue(true)
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'browser-turn-claimed',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)
    await expect(response.text()).resolves.toBe('Grounded answer')

    expect(
      mocks.claimCortexConversationAssistantTurnThroughCoreApi
    ).toHaveBeenCalledWith(
      { conversationId: CONVERSATION_ID, userMessageId: USER_MESSAGE_ID },
      'assistant-browser-turn-claimed',
      { tenantId: 'tenant-a', userId: 'user-a' }
    )
    expect(
      mocks.completeCortexConversationAssistantTurnThroughCoreApi
    ).toHaveBeenCalledWith(
      {
        requestId: ASSISTANT_REQUEST_ID,
        claimToken: ASSISTANT_CLAIM_TOKEN,
        content: 'Grounded answer',
        citationNodeIds: [],
        outcome: 'deterministic_grounded',
        model: 'deterministic-grounded',
      },
      'assistant-browser-turn-claimed',
      { tenantId: 'tenant-a', userId: 'user-a' }
    )
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('uses the provider-free Core job path without Next retrieval or provider spend', async () => {
    const citation = {
      nodeId: NODE_ID,
      nodeType: 'project',
      refTable: 'projects',
      refId: REF_ID,
      title: 'Metro MEP Retrofit',
      projectId: REF_ID,
    }
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.cortexConversationAssistantTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.cortexAssistantGenerationJobsUseCoreApi.mockReturnValue(true)
    mocks.startCortexAssistantGenerationJobThroughCoreApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        jobId: GENERATION_JOB_ID,
        requestId: ASSISTANT_REQUEST_ID,
        status: 'succeeded',
        attemptCount: 1,
        failureCode: null,
        retryable: false,
        createdAt: '2026-08-08T00:00:00.000Z',
        updatedAt: '2026-08-08T00:00:01.000Z',
      },
    })
    mocks.claimCortexConversationAssistantTurnThroughCoreApi
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        data: {
          status: 'claimed',
          conversationId: CONVERSATION_ID,
          userMessageId: USER_MESSAGE_ID,
          requestId: ASSISTANT_REQUEST_ID,
          claimToken: ASSISTANT_CLAIM_TOKEN,
          leaseExpiresAt: '2026-08-08T00:01:00.000Z',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          status: 'succeeded',
          conversationId: CONVERSATION_ID,
          userMessageId: USER_MESSAGE_ID,
          messageId: ASSISTANT_MESSAGE_ID,
          content: 'Worker grounded answer',
          citations: [citation],
          outcome: 'deterministic_grounded',
          model: 'deterministic-grounded-v1',
        },
      })
    vi.stubEnv('OPENAI_API_KEY', 'must-not-be-used')
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'browser-turn-worker',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('Worker grounded answer')
    expect(
      mocks.startCortexAssistantGenerationJobThroughCoreApi
    ).toHaveBeenCalledWith(
      {
        requestId: ASSISTANT_REQUEST_ID,
        claimToken: ASSISTANT_CLAIM_TOKEN,
      },
      'assistant-browser-turn-worker',
      { tenantId: 'tenant-a', userId: 'user-a' }
    )
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
    expect(mocks.consumeProviderQuotaViaCoreApi).not.toHaveBeenCalled()
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
    expect(
      mocks.completeCortexConversationAssistantTurnThroughCoreApi
    ).not.toHaveBeenCalled()
    expect(
      decodeCortexCitationHeader(response.headers.get(CORTEX_CITATIONS_HEADER))
    ).toEqual([citation])
  })

  it('does not fall back to a direct assistant write when Core completion fails', async () => {
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.cortexConversationAssistantTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.completeCortexConversationAssistantTurnThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'Core completion unavailable.',
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'browser-turn-core-failure',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)
    await expect(response.text()).resolves.toBe('Grounded answer')

    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(
      '[cortex/chat] Core assistant completion failed:',
      'Core completion unavailable.'
    )
  })

  it('claims before quota and completes a free grounded fallback when quota blocks', async () => {
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.cortexConversationAssistantTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.consumeProviderQuotaViaCoreApi.mockResolvedValue({
      ok: false,
      status: 429,
      error: 'Provider quota exhausted.',
      retryAfterSeconds: 60,
      limit: 10,
      scope: 'tenant',
    })
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'browser-turn-quota',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('Grounded answer')
    expect(
      mocks.claimCortexConversationAssistantTurnThroughCoreApi.mock
        .invocationCallOrder[0]
    ).toBeLessThan(
      mocks.consumeProviderQuotaViaCoreApi.mock.invocationCallOrder[0] ?? 0
    )
    expect(mocks.openaiCreate).not.toHaveBeenCalled()
    expect(
      mocks.completeCortexConversationAssistantTurnThroughCoreApi
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Grounded answer',
        outcome: 'deterministic_grounded',
        model: 'deterministic-grounded',
      }),
      'assistant-browser-turn-quota',
      { tenantId: 'tenant-a', userId: 'user-a' }
    )
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
  })

  it('fails closed when selected Core user-turn authority is unavailable', async () => {
    mocks.cortexConversationUserTurnWritesUseCoreApi.mockReturnValue(true)
    mocks.appendCortexConversationUserTurnThroughCoreApi.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'Cortex user-turn service is unavailable.',
    })
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'browser-turn-2',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Show active projects' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(503)
    expectPrivate(response)
    await expect(response.text()).resolves.toBe(
      'Cortex user-turn service is unavailable.'
    )
    expect(mocks.createCortexConversation).not.toHaveBeenCalled()
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
  })

  it('redacts direct identifiers before embedding and external model calls', async () => {
    const email = 'jane@example.com'
    const tin = '123-456-789'
    const phone = '+639171234567'
    const sensitiveQuestion = `Call ${email} about TIN ${tin} at ${phone}`
    const node = {
      node_type: 'project',
      title: `Metro MEP Retrofit ${email}`,
      summary: `Owner TIN ${tin}; phone ${phone}`,
    }
    mocks.searchCortexNodes.mockResolvedValue([node])
    mocks.searchCortexNodesByTerms.mockResolvedValue([node])
    mocks.openaiCreate.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'Safe model response' } }] }
      })()
    )
    vi.stubEnv('OPENAI_API_KEY', 'test-key')

    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: sensitiveQuestion }],
      }),
    })

    const response = await POST(request)
    await expect(response.text()).resolves.toBe('Safe model response')
    expectPrivate(response)

    const [modelRequest] = mocks.openaiCreate.mock.calls[0] ?? []
    expect(JSON.stringify(modelRequest)).not.toContain(email)
    expect(JSON.stringify(modelRequest)).not.toContain(tin)
    expect(JSON.stringify(modelRequest)).not.toContain(phone)
    expect(JSON.stringify(modelRequest)).toContain('[email redacted]')
    expect(JSON.stringify(modelRequest)).toContain('[tax id redacted]')
    expect(JSON.stringify(modelRequest)).toContain('[phone redacted]')
    expect(mocks.embedText).toHaveBeenCalledWith(
      expect.stringContaining('[email redacted]')
    )
    expect(mocks.embedText.mock.calls[0]?.[0]).not.toContain(tin)
    expect(mocks.embedText.mock.calls[0]?.[0]).not.toContain(phone)

    const auditDiffs = mocks.writeAuditLog.mock.calls.map(
      ([params]) => params.diff as Record<string, unknown>
    )
    const started = auditDiffs.find((diff) => diff.phase === 'started')
    const completed = auditDiffs.find((diff) => diff.phase === 'completed')
    expect(started?.last_user_message).toBeUndefined()
    expect(started?.prompt_preview).not.toContain(email)
    expect(started?.prompt_preview).not.toContain(tin)
    expect(started?.prompt_preview).not.toContain(phone)
    expect(started?.prompt_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(completed?.response_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
