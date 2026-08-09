import 'reflect-metadata'

import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectCommentDeletionService } from './project-comment-deletion.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'
const COMMAND = { projectId: PROJECT_ID, commentId: COMMENT_ID }

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
      key === 'ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED'
        ? true
        : key === 'ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS'
          ? [PRINCIPAL.tenantId]
          : fallback
    ),
  }
  const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
    callback(transactionClient)
  )
  const service = new ProjectCommentDeletionService(
    config as never,
    { client: { transaction } } as unknown as DatabaseService,
    audit as unknown as AuditService
  )
  return { service, transaction, audit }
}

describe('ProjectCommentDeletionService', () => {
  it('fails closed before opening a transaction when the canary is disabled', async () => {
    const transaction = vi.fn()
    const service = new ProjectCommentDeletionService(
      { get: vi.fn((_key: string, fallback: unknown) => fallback) } as never,
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(
      service.delete(COMMAND, PRINCIPAL, 'comment-delete-disabled')
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
      service.delete(COMMAND, PRINCIPAL, 'comment-delete-forbidden')
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
    expect(audit.stampActor).not.toHaveBeenCalled()
  })

  it('deletes the comment, replay ledger, and semantic audit atomically', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const project = selectQuery([{ id: PROJECT_ID }])
    const noRequest = selectQuery([])
    const comment = selectQuery([
      { id: COMMENT_ID, tenantId: PRINCIPAL.tenantId, projectId: PROJECT_ID },
    ])
    const request = {
      id: '55555555-5555-4555-8555-555555555555',
      requestHash: '',
      state: 'processing',
      result: null,
    }
    const claimed = selectQuery([request])
    const requestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn() }
    })
    const deleted = {
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          { id: COMMENT_ID, tenantId: PRINCIPAL.tenantId, projectId: PROJECT_ID },
        ]),
      }),
    }
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
        .mockReturnValueOnce({ from: noRequest.from })
        .mockReturnValueOnce({ from: comment.from })
        .mockReturnValueOnce({ from: claimed.from }),
      insert: vi.fn().mockReturnValue({ values: requestValues }),
      delete: vi.fn().mockReturnValue(deleted),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }
    const { service, transaction, audit } = enabledService(transactionClient)

    await expect(
      service.delete(COMMAND, PRINCIPAL, 'comment-delete-commit')
    ).resolves.toEqual({
      commentId: COMMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      projectId: PROJECT_ID,
      deleted: true,
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(transactionClient.insert).toHaveBeenCalledOnce()
    expect(transactionClient.delete).toHaveBeenCalledOnce()
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).toHaveBeenCalledWith(
      transactionClient,
      expect.objectContaining({
        entityType: 'project_comment',
        entityId: COMMENT_ID,
        action: 'delete',
        diff: expect.objectContaining({
          project_id: PROJECT_ID,
          idempotency_key_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      })
    )
  })

  it('replays a succeeded deletion after the comment row is gone', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const project = selectQuery([{ id: PROJECT_ID }])
    const replay = {
      commentId: COMMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      projectId: PROJECT_ID,
      deleted: true,
    }
    const crypto = await import('node:crypto')
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ action: 'project-comment.delete', command: COMMAND }))
      .digest('hex')
    const replayQuery = selectQuery([
      {
        id: '66666666-6666-4666-8666-666666666666',
        requestHash,
        state: 'succeeded',
        result: replay,
      },
    ])
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce({ from: project.from })
        .mockReturnValueOnce({ from: replayQuery.from }),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.delete(COMMAND, PRINCIPAL, 'comment-delete-replay')
    ).resolves.toEqual(replay)
    expect('delete' in transactionClient).toBe(false)
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('replays after a concurrent owner commits while the comment lock was held', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const project = selectQuery([{ id: PROJECT_ID }])
    const noRequest = selectQuery([])
    const commentGone = selectQuery([])
    const replay = {
      commentId: COMMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      projectId: PROJECT_ID,
      deleted: true,
    }
    const crypto = await import('node:crypto')
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ action: 'project-comment.delete', command: COMMAND }))
      .digest('hex')
    const completedRequest = selectQuery([
      {
        id: '77777777-7777-4777-8777-777777777777',
        requestHash,
        state: 'succeeded',
        result: replay,
      },
    ])
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce({ from: project.from })
        .mockReturnValueOnce({ from: noRequest.from })
        .mockReturnValueOnce({ from: commentGone.from })
        .mockReturnValueOnce({ from: completedRequest.from }),
      delete: vi.fn(),
    }
    const { service, audit } = enabledService(transactionClient)

    await expect(
      service.delete(COMMAND, PRINCIPAL, 'comment-delete-concurrent-replay')
    ).resolves.toEqual(replay)
    expect(transactionClient.delete).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('conceals a missing project before claiming idempotency', async () => {
    const membership = selectQuery([
      {
        tenantId: PRINCIPAL.tenantId,
        role: PRINCIPAL.role,
        email: PRINCIPAL.email,
      },
    ])
    const project = selectQuery([])
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membership.from })
        .mockReturnValueOnce({ from: project.from }),
      insert: vi.fn(),
    }
    const { service } = enabledService(transactionClient)

    await expect(
      service.delete(COMMAND, PRINCIPAL, 'comment-delete-missing-project')
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(transactionClient.insert).not.toHaveBeenCalled()
  })
})
