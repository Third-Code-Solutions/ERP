import 'reflect-metadata'

import { createHash, createHmac } from 'node:crypto'
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import {
  CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION,
  cortexConversationAssistantTurnSignaturePayload,
} from '@third-code-erp/shared-types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCortexCitationsByNodeIds: vi.fn(),
}))

vi.mock('@third-code-erp/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@third-code-erp/database')>()),
  getCortexCitationsByNodeIds: mocks.getCortexCitationsByNodeIds,
}))

import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CortexAssistantTurnsService } from './cortex-assistant-turns.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const USER_MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const CLAIM_TOKEN = '66666666-6666-4666-8666-666666666666'
const SECRET = 's'.repeat(32)
const NOW = new Date('2026-08-07T12:00:00.000Z')

function digest(command: object): string {
  return createHash('sha256')
    .update(JSON.stringify(command), 'utf8')
    .digest('hex')
}

function signedHeaders(
  operation: 'claim' | 'complete',
  command: object,
  idempotencyKey: string,
  timestamp = String(Math.floor(NOW.getTime() / 1_000))
) {
  const payload = cortexConversationAssistantTurnSignaturePayload({
    operation,
    timestamp,
    tenantId: PRINCIPAL.tenantId,
    userId: PRINCIPAL.userId,
    idempotencyKey,
    commandDigest: digest(command),
  })
  return {
    timestamp,
    signature: `${CORTEX_ASSISTANT_TURN_SIGNATURE_VERSION}=${createHmac(
      'sha256',
      SECRET
    )
      .update(payload)
      .digest('hex')}`,
  }
}

function serviceWith(
  transaction: ReturnType<typeof vi.fn>,
  options: { enabled?: boolean; secret?: string } = {}
) {
  const enabled = options.enabled ?? true
  const secret = options.secret === undefined ? SECRET : options.secret
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => {
      if (
        key ===
        'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED'
      ) {
        return enabled
      }
      if (
        key ===
        'ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS'
      ) {
        return enabled ? [PRINCIPAL.tenantId] : []
      }
      if (key === 'ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET') return secret
      return fallback
    }),
  }
  return new CortexAssistantTurnsService(
    config as never,
    { client: { transaction } } as unknown as DatabaseService,
    {} as AuditService
  )
}

describe('CortexAssistantTurnsService signing boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: NOW })
    mocks.getCortexCitationsByNodeIds.mockResolvedValue([])
  })
  afterEach(() => vi.useRealTimers())

  it('fails closed before signature or database work when disabled', async () => {
    const transaction = vi.fn()
    const service = serviceWith(transaction, { enabled: false })
    const command = {
      conversationId: CONVERSATION_ID,
      userMessageId: USER_MESSAGE_ID,
    }

    await expect(
      service.claim(command, PRINCIPAL, 'assistant-disabled', {
        timestamp: undefined,
        signature: undefined,
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('requires a configured server-only signing secret', async () => {
    const transaction = vi.fn()
    const service = serviceWith(transaction, { secret: '' })
    const command = {
      conversationId: CONVERSATION_ID,
      userMessageId: USER_MESSAGE_ID,
    }

    await expect(
      service.claim(
        command,
        PRINCIPAL,
        'assistant-secret',
        signedHeaders('claim', command, 'assistant-secret')
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects missing, stale, and command-mismatched signatures', async () => {
    const transaction = vi.fn()
    const service = serviceWith(transaction)
    const command = {
      conversationId: CONVERSATION_ID,
      userMessageId: USER_MESSAGE_ID,
    }

    await expect(
      service.claim(command, PRINCIPAL, 'assistant-signature', {
        timestamp: undefined,
        signature: undefined,
      })
    ).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(
      service.claim(
        command,
        PRINCIPAL,
        'assistant-signature',
        signedHeaders(
          'claim',
          command,
          'assistant-signature',
          String(Math.floor(NOW.getTime() / 1_000) - 61)
        )
      )
    ).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(
      service.claim(
        command,
        PRINCIPAL,
        'assistant-signature',
        signedHeaders(
          'claim',
          { ...command, userMessageId: REQUEST_ID },
          'assistant-signature'
        )
      )
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('accepts a current claim signature before entering database authority', async () => {
    const reached = new Error('transaction reached')
    const transaction = vi.fn().mockRejectedValue(reached)
    const service = serviceWith(transaction)
    const command = {
      conversationId: CONVERSATION_ID,
      userMessageId: USER_MESSAGE_ID,
    }

    await expect(
      service.claim(
        command,
        PRINCIPAL,
        'assistant-valid',
        signedHeaders('claim', command, 'assistant-valid')
      )
    ).rejects.toBe(reached)
    expect(transaction).toHaveBeenCalledOnce()
  })

  it('uses a separate operation-bound signature for completion', async () => {
    const reached = new Error('transaction reached')
    const transaction = vi.fn().mockRejectedValue(reached)
    const service = serviceWith(transaction)
    const command = {
      requestId: REQUEST_ID,
      claimToken: CLAIM_TOKEN,
      content: 'Grounded answer',
      citationNodeIds: [],
      outcome: 'deterministic_grounded' as const,
      model: 'deterministic-grounded',
    }

    await expect(
      service.complete(
        command,
        PRINCIPAL,
        'assistant-valid',
        signedHeaders('claim', command, 'assistant-valid')
      )
    ).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(
      service.complete(
        command,
        PRINCIPAL,
        'assistant-valid',
        signedHeaders('complete', command, 'assistant-valid')
      )
    ).rejects.toBe(reached)
    expect(transaction).toHaveBeenCalledOnce()
  })

  it('rehydrates replay citations with the role locked from PostgreSQL', async () => {
    const citationNodeId = '77777777-7777-4777-8777-777777777777'
    const transaction = vi.fn().mockResolvedValue({
      status: 'succeeded',
      authorizedRole: 'viewer',
      conversationId: CONVERSATION_ID,
      userMessageId: USER_MESSAGE_ID,
      messageId: REQUEST_ID,
      content: 'Stored grounded answer',
      citationNodeIds: [citationNodeId],
      outcome: 'deterministic_grounded',
      model: 'deterministic-grounded',
    })
    const service = serviceWith(transaction)
    const command = {
      conversationId: CONVERSATION_ID,
      userMessageId: USER_MESSAGE_ID,
    }

    await expect(
      service.claim(
        command,
        PRINCIPAL,
        'assistant-replay-role',
        signedHeaders('claim', command, 'assistant-replay-role')
      )
    ).resolves.toMatchObject({
      status: 'succeeded',
      citations: [],
    })
    expect(mocks.getCortexCitationsByNodeIds).toHaveBeenCalledWith(
      PRINCIPAL.tenantId,
      [citationNodeId],
      ['task', 'announcement', 'document']
    )
  })
})
