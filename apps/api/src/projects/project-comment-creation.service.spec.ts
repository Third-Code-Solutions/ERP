import 'reflect-metadata'

import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectCommentCreationService } from './project-comment-creation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'
const COMMAND = { projectId: PROJECT_ID, body: 'Delivery is ready.' }

function selectQuery(rows: unknown[]) {
  const rowLock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: rowLock })
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  return { from, rowLock }
}

function enabledService(
  transactionClient: Record<string, unknown>,
  audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
) {
  const config = {
    get: vi.fn((key: string, fallback: unknown) =>
      key === 'ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED'
        ? true
        : key === 'ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS'
          ? [PRINCIPAL.tenantId]
          : fallback
    ),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const service = new ProjectCommentCreationService(
    config as never,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService
  )
  return { service, transaction, audit }
}

describe('ProjectCommentCreationService', () => {
  it('fails closed before opening a transaction when the canary is disabled', async () => {
    const transaction = vi.fn()
    const service = new ProjectCommentCreationService(
      { get: vi.fn((_key: string, fallback: unknown) => fallback) } as never,
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(
      service.create(COMMAND, PRINCIPAL, 'comment-disabled')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('denies a role without project.update before claiming idempotency', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: 'viewer',
        email: 'viewer@example.test',
      },
    ])
    const transactionClient = {
      select: vi.fn().mockReturnValue({ from: membership.from }),
      insert: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.create(COMMAND, PRINCIPAL, 'comment-forbidden')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('commits the comment, replay ledger, and bounded audit atomically', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const request = {
      id: '55555555-5555-4555-8555-555555555555',
      requestHash: '',
      state: 'processing',
      result: null,
    }
    const requestQuery = selectQuery([request])
    const project = selectQuery([{ id: PROJECT_ID }])
    const requestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const commentValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: COMMENT_ID }]),
    })
    const updateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: request.id }]),
      }),
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce({ from: project.from })
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: requestValues })
        .mockReturnValueOnce({ values: commentValues }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }
    const { service, transaction, audit } = enabledService(transactionClient)

    await expect(
      service.create(COMMAND, PRINCIPAL, 'comment-commit')
    ).resolves.toEqual({
      commentId: COMMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      projectId: PROJECT_ID,
      authorId: PRINCIPAL.userId,
      body: COMMAND.body,
      mentions: [],
      created: true,
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionClient.insert).toHaveBeenCalledTimes(2)
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).toHaveBeenCalledWith(
      transactionClient,
      expect.objectContaining({
        entityType: 'project_comment',
        entityId: COMMENT_ID,
        action: 'create',
        diff: expect.objectContaining({
          project_id: PROJECT_ID,
          body_length: COMMAND.body.length,
          mention_count: 0,
          idempotency_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      })
    )
  })

  it('replays a succeeded request without a second comment or semantic audit', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const replay = {
      commentId: COMMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      projectId: PROJECT_ID,
      authorId: PRINCIPAL.userId,
      body: COMMAND.body,
      mentions: [],
      created: true,
    }
    const request = {
      id: '66666666-6666-4666-8666-666666666666',
      requestHash: '',
      state: 'succeeded',
      result: replay,
    }
    const requestQuery = selectQuery([request])
    const project = selectQuery([{ id: PROJECT_ID }])
    const requestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce({ from: project.from })
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi.fn().mockReturnValue({ values: requestValues }),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.create(COMMAND, PRINCIPAL, 'comment-replay')
    ).resolves.toEqual(replay)
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })
})
