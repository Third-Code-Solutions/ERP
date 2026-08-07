import 'reflect-metadata'

import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

const mocks = vi.hoisted(() => ({
  getCortexCitationsByNodeIds: vi.fn(),
  getCortexConversation: vi.fn(),
  getCortexConversationMessages: vi.fn(),
  getCortexNodeByRef: vi.fn(),
  listCortexConversations: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => mocks)

import { CortexConversationsService } from './cortex-conversations.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const NODE_ID = '44444444-4444-4444-8444-444444444444'
const HIDDEN_NODE_ID = '55555555-5555-4555-8555-555555555555'
const REF_ID = '66666666-6666-4666-8666-666666666666'
const TIMESTAMP = new Date('2026-08-07T00:00:00.000Z')

const PRINCIPAL: ErpPrincipal = {
  tenantId: TENANT_ID,
  userId: USER_ID,
  role: 'finance',
  email: 'finance@example.test',
}

function config(enabled = true, tenants = [TENANT_ID]): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_CORTEX_CONVERSATION_READS_ENABLED') return enabled
      if (key === 'ERP_CORTEX_CONVERSATION_READS_TENANT_IDS') return tenants
      return fallback
    }),
  } as unknown as ConfigService
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    title: 'Finance thread',
    context_ref_table: null,
    context_ref_id: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  }
}

describe('CortexConversationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listCortexConversations.mockResolvedValue([])
    mocks.getCortexConversation.mockResolvedValue(null)
    mocks.getCortexConversationMessages.mockResolvedValue(null)
    mocks.getCortexNodeByRef.mockResolvedValue(null)
    mocks.getCortexCitationsByNodeIds.mockResolvedValue([])
  })

  it('fails closed before reading when the tenant canary is disabled', async () => {
    const service = new CortexConversationsService(config(false))

    await expect(service.list(PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(mocks.listCortexConversations).not.toHaveBeenCalled()
  })

  it('lists only owner-scoped threads with currently authorized context', async () => {
    mocks.listCortexConversations.mockResolvedValue([
      conversation(),
      conversation({
        id: '77777777-7777-4777-8777-777777777777',
        context_ref_table: 'invoices',
        context_ref_id: REF_ID,
      }),
      conversation({
        id: '88888888-8888-4888-8888-888888888888',
        context_ref_table: 'vendors',
        context_ref_id: REF_ID,
      }),
    ])
    mocks.getCortexNodeByRef
      .mockResolvedValueOnce({
        id: NODE_ID,
        node_type: 'invoice',
        title: 'INV-2026-001',
      })
      .mockResolvedValueOnce({
        id: HIDDEN_NODE_ID,
        node_type: 'vendor',
        title: 'Hidden vendor',
      })
    const service = new CortexConversationsService(config())

    await expect(service.list(PRINCIPAL)).resolves.toEqual({
      conversations: [
        expect.objectContaining({ id: CONVERSATION_ID, context: null }),
        expect.objectContaining({
          context: expect.objectContaining({
            refTable: 'invoices',
            nodeType: 'invoice',
          }),
        }),
      ],
    })
    expect(mocks.listCortexConversations).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      30
    )
  })

  it('rehydrates stored citation ids under the current role scope', async () => {
    mocks.getCortexConversation.mockResolvedValue(conversation())
    mocks.getCortexConversationMessages.mockResolvedValue([
      {
        role: 'assistant',
        content: 'Grounded answer',
        created_at: TIMESTAMP,
        citations: [
          { nodeId: NODE_ID, title: 'Stored title is ignored' },
          { nodeId: HIDDEN_NODE_ID },
          { nodeId: 'invalid' },
        ],
      },
    ])
    mocks.getCortexCitationsByNodeIds.mockResolvedValue([
      {
        nodeId: NODE_ID,
        nodeType: 'invoice',
        refTable: 'invoices',
        refId: REF_ID,
        title: 'Current invoice title',
        projectId: null,
      },
    ])
    const service = new CortexConversationsService(config())

    await expect(service.read(CONVERSATION_ID, PRINCIPAL)).resolves.toEqual({
      context: null,
      messages: [
        expect.objectContaining({
          content: 'Grounded answer',
          created_at: TIMESTAMP.toISOString(),
          citations: [expect.objectContaining({ nodeId: NODE_ID })],
        }),
      ],
    })
    expect(mocks.getCortexConversation).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      CONVERSATION_ID
    )
    expect(mocks.getCortexCitationsByNodeIds).toHaveBeenCalledWith(
      TENANT_ID,
      [NODE_ID, HIDDEN_NODE_ID],
      expect.arrayContaining(['invoice', 'journal_entry'])
    )
  })

  it('conceals a thread after its record context is revoked', async () => {
    mocks.getCortexConversation.mockResolvedValue(
      conversation({
        context_ref_table: 'vendors',
        context_ref_id: REF_ID,
      })
    )
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: HIDDEN_NODE_ID,
      node_type: 'vendor',
      title: 'Hidden vendor',
    })
    const service = new CortexConversationsService(config())

    await expect(
      service.read(CONVERSATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mocks.getCortexConversationMessages).not.toHaveBeenCalled()
  })

  it('conceals a foreign or absent conversation before message access', async () => {
    const service = new CortexConversationsService(config())

    await expect(
      service.read(CONVERSATION_ID, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mocks.getCortexConversationMessages).not.toHaveBeenCalled()
  })
})
