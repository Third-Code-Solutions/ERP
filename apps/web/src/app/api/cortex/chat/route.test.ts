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

import { POST } from './route'
import {
  CORTEX_CITATIONS_HEADER,
  decodeCortexCitationHeader,
} from '@/lib/cortex/citation-header'

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111'
const NODE_ID = '22222222-2222-4222-8222-222222222222'
const REF_ID = '33333333-3333-4333-8333-333333333333'

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
