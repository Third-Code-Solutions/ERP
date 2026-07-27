import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  ownsCortexConversation: vi.fn(),
  appendCortexMessage: vi.fn(),
  createCortexConversation: vi.fn(),
  searchCortexNodes: vi.fn(),
  searchCortexNodesByTerms: vi.fn(),
  cortexSemanticSearch: vi.fn(),
  getCortexGraphStats: vi.fn(),
  cortexKeywordAnswer: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  ownsCortexConversation: mocks.ownsCortexConversation,
  appendCortexMessage: mocks.appendCortexMessage,
  createCortexConversation: mocks.createCortexConversation,
  searchCortexNodes: mocks.searchCortexNodes,
  searchCortexNodesByTerms: mocks.searchCortexNodesByTerms,
  cortexSemanticSearch: mocks.cortexSemanticSearch,
  getCortexGraphStats: mocks.getCortexGraphStats,
  cortexKeywordAnswer: mocks.cortexKeywordAnswer,
}))

vi.mock('@third-code-erp/ai', () => ({
  embedText: vi.fn(),
  getOpenAI: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('@/lib/cortex/rbac', () => ({
  cortexNodeTypeScope: vi.fn(() => null),
}))

vi.mock('@/lib/operations/nav-config', () => ({
  roleLabel: vi.fn(() => 'Admin'),
}))

import { POST } from './route'

describe('Cortex chat conversation ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: 'tenant-a',
      role: 'admin',
      user: { id: 'user-a' },
    })
  })

  it('rejects a client-supplied conversation not owned by the caller', async () => {
    mocks.ownsCortexConversation.mockResolvedValue(false)
    const request = new NextRequest('http://localhost/api/cortex/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: 'conversation-owned-by-another-user',
        messages: [{ role: 'user', content: 'Show my recent projects' }],
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(404)
    await expect(response.text()).resolves.toBe('Conversation not found')
    expect(mocks.ownsCortexConversation).toHaveBeenCalledWith(
      'tenant-a',
      'user-a',
      'conversation-owned-by-another-user'
    )
    expect(mocks.appendCortexMessage).not.toHaveBeenCalled()
    expect(mocks.searchCortexNodes).not.toHaveBeenCalled()
  })
})
