import { NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'

const mocks = vi.hoisted(() => ({
  getCortexConversation: vi.fn(),
  getCortexNodeByRef: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => mocks)

import { CortexConversationContextService } from './cortex-conversation-context.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const NODE_ID = '44444444-4444-4444-8444-444444444444'
const REF_ID = '55555555-5555-4555-8555-555555555555'

const PRINCIPAL: ErpPrincipal = {
  tenantId: TENANT_ID,
  userId: USER_ID,
  role: 'finance',
  email: 'finance@example.test',
}

function config(enabled = true, tenants = [TENANT_ID]): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED') return enabled
      if (key === 'ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS') return tenants
      return fallback
    }),
  } as unknown as ConfigService
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    context_ref_table: null,
    context_ref_id: null,
    ...overrides,
  }
}

describe('CortexConversationContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCortexConversation.mockResolvedValue(null)
    mocks.getCortexNodeByRef.mockResolvedValue(null)
  })

  it('fails closed before touching conversation or graph data', async () => {
    const service = new CortexConversationContextService(config(false))

    await expect(service.resolve({}, PRINCIPAL)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(mocks.getCortexConversation).not.toHaveBeenCalled()
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('requires tenant and user ownership before resolving stored context', async () => {
    const service = new CortexConversationContextService(config())

    await expect(
      service.resolve({ conversationId: CONVERSATION_ID }, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mocks.getCortexConversation).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      CONVERSATION_ID
    )
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('conceals a half-bound stored context as not found', async () => {
    mocks.getCortexConversation.mockResolvedValue(
      conversation({ context_ref_table: 'projects', context_ref_id: null })
    )
    const service = new CortexConversationContextService(config())

    await expect(
      service.resolve({ conversationId: CONVERSATION_ID }, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('preserves immutable context mismatch as conflict', async () => {
    mocks.getCortexConversation.mockResolvedValue(
      conversation({ context_ref_table: 'projects', context_ref_id: REF_ID })
    )
    const service = new CortexConversationContextService(config())

    await expect(
      service.resolve(
        {
          conversationId: CONVERSATION_ID,
          context: { refTable: 'invoices', refId: REF_ID },
        },
        PRINCIPAL
      )
    ).rejects.toMatchObject({ status: 409 })
    expect(mocks.getCortexNodeByRef).not.toHaveBeenCalled()
  })

  it('rehydrates and role-checks the stored canonical context', async () => {
    mocks.getCortexConversation.mockResolvedValue(
      conversation({ context_ref_table: 'projects', context_ref_id: REF_ID })
    )
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'project',
      title: 'Metro Retrofit',
    })
    const service = new CortexConversationContextService(config())

    await expect(
      service.resolve(
        {
          conversationId: CONVERSATION_ID,
          context: { refTable: 'projects', refId: REF_ID },
        },
        PRINCIPAL
      )
    ).resolves.toEqual({
      conversationId: CONVERSATION_ID,
      context: {
        refTable: 'projects',
        refId: REF_ID,
        nodeId: NODE_ID,
        nodeType: 'project',
        title: 'Metro Retrofit',
      },
    })
  })

  it('conceals a stored context after its graph record is revoked', async () => {
    mocks.getCortexConversation.mockResolvedValue(
      conversation({ context_ref_table: 'projects', context_ref_id: REF_ID })
    )
    const service = new CortexConversationContextService(config())

    await expect(
      service.resolve({ conversationId: CONVERSATION_ID }, PRINCIPAL)
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(mocks.getCortexNodeByRef).toHaveBeenCalledWith(
      TENANT_ID,
      'projects',
      REF_ID
    )
  })

  it('authorizes a new focused record without creating or reading a conversation', async () => {
    mocks.getCortexNodeByRef.mockResolvedValue({
      id: NODE_ID,
      node_type: 'project',
      title: 'Metro Retrofit',
    })
    const service = new CortexConversationContextService(config())

    await expect(
      service.resolve(
        { context: { refTable: 'projects', refId: REF_ID } },
        PRINCIPAL
      )
    ).resolves.toMatchObject({
      conversationId: null,
      context: { nodeId: NODE_ID, refTable: 'projects', refId: REF_ID },
    })
    expect(mocks.getCortexConversation).not.toHaveBeenCalled()
    expect(mocks.getCortexNodeByRef).toHaveBeenCalledWith(
      TENANT_ID,
      'projects',
      REF_ID
    )
  })

  it('conceals a new missing or forbidden focus', async () => {
    const service = new CortexConversationContextService(config())

    await expect(
      service.resolve(
        { context: { refTable: 'projects', refId: REF_ID } },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('maps an unregistered source name to the same non-enumerating 404', async () => {
    const service = new CortexConversationContextService(config())

    await expect(
      service.resolve(
        { context: { refTable: 'private_records', refId: REF_ID } },
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(NotFoundException)
  })
})
