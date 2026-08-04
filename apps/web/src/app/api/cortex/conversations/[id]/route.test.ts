import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getCortexConversation: vi.fn(),
  getCortexConversationMessages: vi.fn(),
  getCortexCitationsByNodeIds: vi.fn(),
  authorizeCortexRecordContext: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
}))

vi.mock('@third-code-erp/database', () => ({
  getCortexConversation: mocks.getCortexConversation,
  getCortexConversationMessages: mocks.getCortexConversationMessages,
  getCortexCitationsByNodeIds: mocks.getCortexCitationsByNodeIds,
}))

vi.mock('@/lib/cortex/record-context', () => ({
  authorizeCortexRecordContext: mocks.authorizeCortexRecordContext,
}))

import { GET } from './route'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const VISIBLE_NODE_ID = '44444444-4444-4444-8444-444444444444'
const FORBIDDEN_NODE_ID = '55555555-5555-4555-8555-555555555555'
const REF_ID = '66666666-6666-4666-8666-666666666666'

function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  )
  expect(response.headers.get('vary')).toBe('Cookie')
}

function request() {
  return GET(
    new NextRequest(
      `http://localhost/api/cortex/conversations/${CONVERSATION_ID}`
    ),
    { params: Promise.resolve({ id: CONVERSATION_ID }) }
  )
}

describe('Cortex conversation citation reauthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      tenantId: TENANT_ID,
      role: 'finance',
      user: { id: USER_ID },
    })
    mocks.getCortexConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      title: 'Finance thread',
      context_ref_table: null,
      context_ref_id: null,
      created_at: new Date('2026-07-29T00:00:00.000Z'),
      updated_at: new Date('2026-07-29T00:00:00.000Z'),
    })
    mocks.authorizeCortexRecordContext.mockResolvedValue(null)
    mocks.getCortexConversationMessages.mockResolvedValue([
      {
        role: 'assistant',
        content: 'Grounded answer',
        created_at: new Date('2026-07-29T00:00:00.000Z'),
        citations: [
          { nodeId: VISIBLE_NODE_ID, title: 'Stored title is not trusted' },
          { nodeId: FORBIDDEN_NODE_ID, title: 'Previously visible' },
          { nodeId: 'invalid', title: 'Corrupt metadata' },
        ],
      },
    ])
    mocks.getCortexCitationsByNodeIds.mockResolvedValue([
      {
        nodeId: VISIBLE_NODE_ID,
        nodeType: 'invoice',
        refTable: 'invoices',
        refId: REF_ID,
        title: 'Current invoice title',
        projectId: null,
      },
    ])
  })

  it('rehydrates stored IDs under current tenant and role scope', async () => {
    const response = await request()
    const body = await response.json()

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(mocks.getCortexConversationMessages).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      CONVERSATION_ID
    )
    expect(mocks.getCortexCitationsByNodeIds).toHaveBeenCalledWith(
      TENANT_ID,
      [VISIBLE_NODE_ID, FORBIDDEN_NODE_ID],
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
    expect(body.messages[0].citations).toEqual([
      {
        nodeId: VISIBLE_NODE_ID,
        nodeType: 'invoice',
        refTable: 'invoices',
        refId: REF_ID,
        title: 'Current invoice title',
        projectId: null,
      },
    ])
  })

  it('does not query citations for a missing or foreign conversation', async () => {
    mocks.getCortexConversation.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(404)
    expectPrivate(response)
    expect(mocks.getCortexConversationMessages).not.toHaveBeenCalled()
    expect(mocks.getCortexCitationsByNodeIds).not.toHaveBeenCalled()
  })

  it('reauthorizes and returns the persisted record context', async () => {
    const context = {
      refTable: 'invoices',
      refId: REF_ID,
      nodeId: VISIBLE_NODE_ID,
      nodeType: 'invoice',
      title: 'INV-2026-001',
    }
    mocks.getCortexConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      title: 'Invoice thread',
      context_ref_table: context.refTable,
      context_ref_id: context.refId,
      created_at: new Date('2026-07-29T00:00:00.000Z'),
      updated_at: new Date('2026-07-29T00:00:00.000Z'),
    })
    mocks.authorizeCortexRecordContext.mockResolvedValue(context)

    const response = await request()
    const body = await response.json()

    expect(response.status).toBe(200)
    expectPrivate(response)
    expect(body.context).toEqual(context)
    expect(mocks.authorizeCortexRecordContext).toHaveBeenCalledWith(
      TENANT_ID,
      'finance',
      { refTable: 'invoices', refId: REF_ID }
    )
  })

  it('hides a scoped conversation after current access is revoked', async () => {
    mocks.getCortexConversation.mockResolvedValue({
      id: CONVERSATION_ID,
      title: 'Revoked thread',
      context_ref_table: 'projects',
      context_ref_id: REF_ID,
      created_at: new Date('2026-07-29T00:00:00.000Z'),
      updated_at: new Date('2026-07-29T00:00:00.000Z'),
    })
    mocks.authorizeCortexRecordContext.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(404)
    expectPrivate(response)
    expect(mocks.getCortexConversationMessages).not.toHaveBeenCalled()
    expect(mocks.getCortexCitationsByNodeIds).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated request before conversation access', async () => {
    mocks.getUserProfile.mockResolvedValue(null)

    const response = await request()

    expect(response.status).toBe(401)
    expectPrivate(response)
    expect(mocks.getCortexConversation).not.toHaveBeenCalled()
    expect(mocks.getCortexConversationMessages).not.toHaveBeenCalled()
  })
})
