import 'reflect-metadata'

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CortexConversationTurnsService } from './cortex-conversation-turns.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const CONTEXT_ID = '66666666-6666-4666-8666-666666666666'

function lockedRows(rows: unknown[]) {
  const lock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: lock })
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

function orderedLockedRows(rows: unknown[]) {
  const lock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: lock })
  const orderBy = vi.fn().mockReturnValue({ limit })
  const where = vi.fn().mockReturnValue({ orderBy })
  const from = vi.fn().mockReturnValue({ where })
  return { from }
}

function processingRequest() {
  return {
    id: REQUEST_ID,
    requestHash: '',
    state: 'processing' as const,
    result: null,
  }
}

function enabledService(
  transactionClient: Record<string, unknown>,
  audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED'
        ? true
        : [PRINCIPAL.tenantId]
    ),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  return {
    service: new CortexConversationTurnsService(
      config as never,
      { client: { transaction } } as unknown as DatabaseService,
      audit as unknown as AuditService
    ),
    audit,
    transaction,
  }
}

function actorQuery(role: ErpPrincipal['role'] = PRINCIPAL.role) {
  return lockedRows([
    {
      tenantId: PRINCIPAL.tenantId,
      role,
      email: PRINCIPAL.email,
    },
  ])
}

describe('CortexConversationTurnsService', () => {
  it('fails closed before opening a transaction when disabled', async () => {
    const transaction = vi.fn()
    const service = new CortexConversationTurnsService(
      { get: vi.fn((_key: string, fallback: unknown) => fallback) } as never,
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(
      service.appendUserTurn(
        { content: 'What changed?' },
        PRINCIPAL,
        'turn-disabled'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('denies a locked member without Cortex capability before idempotency', async () => {
    const actor = actorQuery('viewer')
    const transactionClient = {
      select: vi.fn().mockReturnValue({ from: actor.from }),
      insert: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    // Simulate a future deny-by-default role value at the database boundary.
    actor.from().where().limit().for.mockResolvedValueOnce([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'unknown_role',
        email: PRINCIPAL.email,
      },
    ])

    await expect(
      service.appendUserTurn(
        { content: 'What changed?' },
        PRINCIPAL,
        'turn-denied'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('creates one redacted-title conversation, one user turn, and one audit', async () => {
    const request = processingRequest()
    const actor = actorQuery()
    const requestQuery = lockedRows([request])
    let conversationValues: Record<string, unknown> | undefined
    let messageValues: Record<string, unknown> | undefined
    const requestInsert = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const conversationInsert = vi.fn().mockImplementation((values) => {
      conversationValues = values
      return {
        returning: vi.fn().mockResolvedValue([{ id: CONVERSATION_ID }]),
      }
    })
    const messageInsert = vi.fn().mockImplementation((values) => {
      messageValues = values
      return { returning: vi.fn().mockResolvedValue([{ id: MESSAGE_ID }]) }
    })
    const completeWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: REQUEST_ID }]),
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: actor.from })
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: requestInsert })
        .mockReturnValueOnce({ values: conversationInsert })
        .mockReturnValueOnce({ values: messageInsert }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: completeWhere }),
      }),
    }
    const { service, audit } = enabledService(transactionClient)
    const content = 'Call 09171234567 or foreman@example.test today'

    await expect(
      service.appendUserTurn({ content }, PRINCIPAL, 'turn-create')
    ).resolves.toEqual({
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      status: 'created',
    })
    expect(conversationValues).toMatchObject({
      tenant_id: PRINCIPAL.tenantId,
      user_id: PRINCIPAL.userId,
      title: 'Call [phone redacted] or [email redacted] today',
    })
    expect(messageValues).toMatchObject({
      tenant_id: PRINCIPAL.tenantId,
      conversation_id: CONVERSATION_ID,
      role: 'user',
      content,
      citations: null,
    })
    expect(audit.writeSemantic).toHaveBeenCalledWith(
      transactionClient,
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        actorId: PRINCIPAL.userId,
        entityId: CONVERSATION_ID,
        action: 'create',
        diff: expect.objectContaining({
          turn_role: 'user',
          content_char_count: content.length,
        }),
      })
    )
    expect(JSON.stringify(audit.writeSemantic.mock.calls)).not.toContain(content)
  })

  it('replays a completed request without another conversation mutation or audit', async () => {
    const result = {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      status: 'appended' as const,
    }
    const request = {
      id: REQUEST_ID,
      requestHash: '',
      state: 'succeeded' as const,
      result,
    }
    const actor = actorQuery()
    const requestQuery = lockedRows([request])
    const requestInsert = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: actor.from })
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi.fn().mockReturnValue({ values: requestInsert }),
      update: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.appendUserTurn(
        { conversationId: CONVERSATION_ID, content: 'Again' },
        PRINCIPAL,
        'turn-replay'
      )
    ).resolves.toEqual(result)
    expect(transactionClient.insert).toHaveBeenCalledTimes(1)
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('rejects a reused key with a different command', async () => {
    const actor = actorQuery()
    const requestQuery = lockedRows([
      {
        id: REQUEST_ID,
        requestHash: '0'.repeat(64),
        state: 'succeeded',
        result: {
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          status: 'created',
        },
      },
    ])
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: actor.from })
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn() }),
      }),
    }
    const { service } = enabledService(transactionClient)

    await expect(
      service.appendUserTurn(
        { content: 'Different command' },
        PRINCIPAL,
        'turn-conflict'
      )
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('hides a scoped existing conversation after record access is revoked', async () => {
    const request = processingRequest()
    const actor = actorQuery()
    const requestQuery = lockedRows([request])
    const conversationQuery = lockedRows([
      {
        id: CONVERSATION_ID,
        contextRefTable: 'projects',
        contextRefId: CONTEXT_ID,
      },
    ])
    const nodeQuery = orderedLockedRows([])
    const requestInsert = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: actor.from })
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: conversationQuery.from })
        .mockReturnValueOnce({ from: nodeQuery.from }),
      insert: vi.fn().mockReturnValue({ values: requestInsert }),
      update: vi.fn(),
    }
    const { service } = enabledService(transactionClient)

    await expect(
      service.appendUserTurn(
        { conversationId: CONVERSATION_ID, content: 'Hidden' },
        PRINCIPAL,
        'turn-hidden'
      )
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(transactionClient.insert).toHaveBeenCalledTimes(1)
    expect(transactionClient.update).not.toHaveBeenCalled()
  })
})
