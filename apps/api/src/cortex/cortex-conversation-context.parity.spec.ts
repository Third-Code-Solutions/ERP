import { ConflictException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type {
  CortexConversationContextRef,
  CortexConversationContextResolveResponse,
  CortexConversationContextResolveQuery,
} from '@third-code-erp/shared-types'

const mocks = vi.hoisted(() => ({
  getCortexConversation: vi.fn(),
  getCortexNodeByRef: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => mocks)

import { CortexConversationContextService } from './cortex-conversation-context.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const FINANCE_USER_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_NODE_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_REF_ID = '55555555-5555-4555-8555-555555555555'
const INVOICE_NODE_ID = '66666666-6666-4666-8666-666666666666'
const INVOICE_REF_ID = '77777777-7777-4777-8777-777777777777'

type LegacyContext = {
  refTable: string
  refId: string
  nodeId: string
  nodeType: string
  title: string | null
}

type LegacyOutcome =
  | { ok: true; value: { conversationId: string | null; context: LegacyContext | null } }
  | { ok: false; status: 404 | 409; body: string }

type Fixture = {
  name: string
  role: ErpPrincipal['role']
  query: CortexConversationContextResolveQuery
  conversation?: {
    id: string
    context_ref_table: string | null
    context_ref_id: string | null
  } | null
  node?: {
    id: string
    node_type: string
    title: string | null
  } | null
  legacy: LegacyOutcome
}

const projectContext: CortexConversationContextRef = {
  refTable: 'projects',
  refId: PROJECT_REF_ID,
}

const invoiceContext: CortexConversationContextRef = {
  refTable: 'invoices',
  refId: INVOICE_REF_ID,
}

const projectNode = {
  id: PROJECT_NODE_ID,
  node_type: 'project',
  title: 'Metro Retrofit',
}

const invoiceNode = {
  id: INVOICE_NODE_ID,
  node_type: 'invoice',
  title: 'Invoice 1042',
}

const ownedConversation = {
  id: CONVERSATION_ID,
  context_ref_table: null,
  context_ref_id: null,
}

const ownedProjectConversation = {
  id: CONVERSATION_ID,
  context_ref_table: projectContext.refTable,
  context_ref_id: projectContext.refId,
}

function success(
  conversationId: string | null,
  context: LegacyContext | null
): LegacyOutcome {
  return { ok: true, value: { conversationId, context } }
}

function error(status: 404 | 409, body: string): LegacyOutcome {
  return { ok: false, status, body }
}

/**
 * Frozen expected results from the current Web chat route's pre-write branch.
 * This intentionally stays a fixture, not a second runtime authority. It
 * captures the observable legacy status/body and normalized context shape so
 * Core can be compared without HTTP, Supabase, provider, or browser state.
 */
const CASES: Fixture[] = [
  {
    name: 'new unscoped chat',
    role: 'finance',
    query: {},
    legacy: success(null, null),
  },
  {
    name: 'owned unscoped conversation restore',
    role: 'finance',
    query: { conversationId: CONVERSATION_ID },
    conversation: ownedConversation,
    legacy: success(CONVERSATION_ID, null),
  },
  {
    name: 'owned conversation with matching focused project',
    role: 'finance',
    query: { conversationId: CONVERSATION_ID, context: projectContext },
    conversation: ownedProjectConversation,
    node: projectNode,
    legacy: success(CONVERSATION_ID, {
      refTable: 'projects',
      refId: PROJECT_REF_ID,
      nodeId: PROJECT_NODE_ID,
      nodeType: 'project',
      title: 'Metro Retrofit',
    }),
  },
  {
    name: 'foreign or missing conversation',
    role: 'finance',
    query: { conversationId: CONVERSATION_ID },
    legacy: error(404, 'Conversation not found'),
  },
  {
    name: 'half-bound stored context',
    role: 'finance',
    query: { conversationId: CONVERSATION_ID },
    conversation: {
      ...ownedConversation,
      context_ref_table: 'projects',
    },
    legacy: error(404, 'Conversation not found'),
  },
  {
    name: 'revoked stored focused record',
    role: 'finance',
    query: { conversationId: CONVERSATION_ID },
    conversation: ownedProjectConversation,
    legacy: error(404, 'Conversation not found'),
  },
  {
    name: 'new focused invoice',
    role: 'finance',
    query: { context: invoiceContext },
    node: invoiceNode,
    legacy: success(null, {
      refTable: 'invoices',
      refId: INVOICE_REF_ID,
      nodeId: INVOICE_NODE_ID,
      nodeType: 'invoice',
      title: 'Invoice 1042',
    }),
  },
  {
    name: 'new focused invoice within Viewer read scope',
    role: 'viewer',
    query: { context: invoiceContext },
    node: invoiceNode,
    legacy: success(null, {
      refTable: 'invoices',
      refId: INVOICE_REF_ID,
      nodeId: INVOICE_NODE_ID,
      nodeType: 'invoice',
      title: 'Invoice 1042',
    }),
  },
  {
    name: 'immutable context mismatch',
    role: 'finance',
    query: { conversationId: CONVERSATION_ID, context: invoiceContext },
    conversation: ownedProjectConversation,
    legacy: error(409, 'Conversation context mismatch'),
  },
  {
    name: 'unsupported source remains concealed',
    role: 'finance',
    query: {
      context: {
        refTable: 'private_records',
        refId: INVOICE_REF_ID,
      },
    },
    legacy: error(404, 'Focused record not found'),
  },
  {
    name: 'source and graph node type mismatch remains concealed',
    role: 'finance',
    query: { context: projectContext },
    node: invoiceNode,
    legacy: error(404, 'Focused record not found'),
  },
]

function config(): ConfigService {
  return {
    get: vi.fn((key: string, fallback: unknown) => {
      if (key === 'ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED') return true
      if (key === 'ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS') {
        return [TENANT_ID]
      }
      return fallback
    }),
  } as unknown as ConfigService
}

function principal(role: ErpPrincipal['role']): ErpPrincipal {
  return {
    tenantId: TENANT_ID,
    userId: FINANCE_USER_ID,
    role,
    email: `${role}@example.test`,
  }
}

async function capture(
  action: () => Promise<unknown>
): Promise<LegacyOutcome> {
  try {
    return {
      ok: true,
      value: (await action()) as CortexConversationContextResolveResponse,
    }
  } catch (caught) {
    if (caught instanceof ConflictException || caught instanceof NotFoundException) {
      return {
        ok: false,
        status: caught.getStatus() as 404 | 409,
        body: caught.message,
      }
    }
    throw caught
  }
}

describe('Cortex conversation owner/context legacy-Core parity fixture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCortexConversation.mockResolvedValue(null)
    mocks.getCortexNodeByRef.mockResolvedValue(null)
  })

  it.each(CASES)('$name matches frozen legacy resolution', async (fixture) => {
    mocks.getCortexConversation.mockResolvedValue(fixture.conversation ?? null)
    mocks.getCortexNodeByRef.mockResolvedValue(fixture.node ?? null)

    const service = new CortexConversationContextService(config())
    const actual = await capture(() =>
      service.resolve(fixture.query, principal(fixture.role))
    )

    expect(actual).toEqual(fixture.legacy)
  })

  it('keeps fixture authority read-only and tenant/user derived', async () => {
    const fixture = CASES[2]!
    mocks.getCortexConversation.mockResolvedValue(fixture.conversation)
    mocks.getCortexNodeByRef.mockResolvedValue(fixture.node)

    const service = new CortexConversationContextService(config())
    await service.resolve(fixture.query, principal(fixture.role))

    expect(mocks.getCortexConversation).toHaveBeenCalledWith(
      TENANT_ID,
      FINANCE_USER_ID,
      CONVERSATION_ID
    )
    expect(mocks.getCortexNodeByRef).toHaveBeenCalledWith(
      TENANT_ID,
      'projects',
      PROJECT_REF_ID
    )
  })
})
