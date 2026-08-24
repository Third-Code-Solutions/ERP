import 'reflect-metadata'

import { createHash } from 'node:crypto'
import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import {
  contracts,
  documents,
  publicSigningRequests,
  signatureSessions,
} from '@third-code-erp/database/schema'
import type { PublicSigningResult } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type {
  DatabaseService,
  DatabaseTransaction,
} from '../database/database.service'
import { lockProjectDocumentStorageForCreate } from './document-storage-quota'
import type { PublicSigningStorageService } from './public-signing.storage'
import { PublicSigningService } from './public-signing.service'

vi.mock('./document-storage-quota', () => ({
  lockProjectDocumentStorageForCreate: vi.fn(),
}))

const BODY = {
  signerName: 'Ana Reyes',
  signerEmail: 'ana@example.com',
  signatureDataUrl: 'data:image/png;base64,abc=',
}

function service(
  enabled = false,
  tenantIds: string[] = [],
  session?: Record<string, unknown>,
  existing?: Record<string, unknown>
) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_PUBLIC_SIGNING_WRITES_ENABLED' ? enabled : tenantIds
    ),
  } as unknown as ConfigService
  const query = (rows: unknown[]) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {}
    chain.from = vi.fn().mockReturnValue(chain)
    chain.where = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockResolvedValue(rows)
    return chain
  }
  const select = vi
    .fn()
    .mockReturnValueOnce(query(session ? [session] : []))
    .mockReturnValueOnce(query(existing ? [existing] : []))
    .mockReturnValue(query([]))
  const transaction = vi.fn()
  const database = {
    client: { select, transaction },
  } as unknown as DatabaseService
  const storage = {
    upload: vi.fn(),
    remove: vi.fn(),
  } as unknown as PublicSigningStorageService
  return {
    service: new PublicSigningService(
      config,
      database,
      {} as AuditService,
      storage
    ),
    select,
    transaction,
    storage,
  }
}

type PublicSigningCommitBoundary = {
  commit(
    transaction: DatabaseTransaction,
    sessionId: string,
    tenantId: string,
    tokenHash: string,
    objectKey: string,
    sizeBytes: number,
    command: { signerName: string; signerEmail?: string | null },
    idempotencyKey: string,
    requestHash: string
  ): Promise<PublicSigningResult>
}

function replayRequestHash(token: string): string {
  const tokenHash = createHash('sha256').update(token).digest('hex')
  return createHash('sha256')
    .update(
      JSON.stringify({
        signatureDataUrl: BODY.signatureDataUrl,
        signerEmail: BODY.signerEmail,
        signerName: BODY.signerName,
        tokenHash,
      })
    )
    .digest('hex')
}

describe('PublicSigningService migration boundary', () => {
  it('fails closed before token or Storage work when disabled', async () => {
    const probe = service()
    await expect(
      probe.service.sign('a'.repeat(64), BODY, 'public-sign-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.select).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    const probe = service(true)
    await expect(
      probe.service.sign('a'.repeat(64), BODY, 'public-sign-1')
    ).rejects.toThrow(
      'Public signing is not enabled for this tenant; no signature was recorded.'
    )
    expect(probe.select).not.toHaveBeenCalled()
  })

  it('rejects an email mismatch before idempotency, upload, or mutation', async () => {
    const tenantId = '22222222-2222-4222-8222-222222222222'
    const probe = service(true, [tenantId], {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: tenantId,
      entity_type: 'contract',
      entity_id: '33333333-3333-4333-8333-333333333333',
      signer_email: ' Expected@Example.com ',
      signed_at: null,
      revoked_at: null,
      expires_at: new Date('2099-01-01T00:00:00.000Z'),
    })

    await expect(
      probe.service.sign(
        'a'.repeat(64),
        { ...BODY, signerEmail: 'different@example.com' },
        'public-sign-1'
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(probe.select).toHaveBeenCalledOnce()
    expect(probe.storage.upload).not.toHaveBeenCalled()
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('preserves bearer-only signing when a session was minted without email', async () => {
    const tenantId = '22222222-2222-4222-8222-222222222222'
    const probe = service(true, [tenantId], {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: tenantId,
      entity_type: 'contract',
      entity_id: '33333333-3333-4333-8333-333333333333',
      signer_email: null,
      signed_at: null,
      revoked_at: null,
      expires_at: new Date('2099-01-01T00:00:00.000Z'),
    })

    await expect(
      probe.service.sign(
        'a'.repeat(64),
        { ...BODY, signerEmail: undefined },
        'public-sign-1'
      )
    ).rejects.toThrow('Source entity not found')
    expect(probe.storage.upload).not.toHaveBeenCalled()
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('returns an exact committed replay even after the session is signed', async () => {
    const tenantId = '22222222-2222-4222-8222-222222222222'
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const entityId = '33333333-3333-4333-8333-333333333333'
    const token = 'a'.repeat(64)
    const result: PublicSigningResult = {
      sessionId,
      tenantId,
      entityType: 'contract',
      entityId,
      signatureDocumentId: '44444444-4444-4444-8444-444444444444',
      signedAt: '2026-08-24T00:00:00.000Z',
    }
    const probe = service(
      true,
      [tenantId],
      {
        id: sessionId,
        tenant_id: tenantId,
        entity_type: 'contract',
        entity_id: entityId,
        signer_email: BODY.signerEmail,
        signed_at: new Date(result.signedAt),
        revoked_at: null,
        expires_at: new Date('2099-01-01T00:00:00.000Z'),
      },
      {
        requestHash: replayRequestHash(token),
        state: 'succeeded',
        result,
      }
    )

    await expect(
      probe.service.sign(token, BODY, 'public-sign-1')
    ).resolves.toEqual(result)
    expect(probe.storage.upload).not.toHaveBeenCalled()
    expect(probe.transaction).not.toHaveBeenCalled()
    expect(lockProjectDocumentStorageForCreate).not.toHaveBeenCalled()
  })

  it('replays a committed transaction before consulting current project quota', async () => {
    const tenantId = '22222222-2222-4222-8222-222222222222'
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const entityId = '33333333-3333-4333-8333-333333333333'
    const documentId = '44444444-4444-4444-8444-444444444444'
    const requestHash = 'request-hash'
    const result: PublicSigningResult = {
      sessionId,
      tenantId,
      entityType: 'contract',
      entityId,
      signatureDocumentId: documentId,
      signedAt: '2026-08-24T00:00:00.000Z',
    }
    const lockedSession = {
      id: sessionId,
      tenant_id: tenantId,
      token_hash: 'token-hash',
      signed_at: new Date(result.signedAt),
      revoked_at: null,
      expires_at: new Date('2099-01-01T00:00:00.000Z'),
    }
    const committedRequest = {
      id: '66666666-6666-4666-8666-666666666666',
      requestHash,
      state: 'succeeded',
      result,
    }
    const lockedRows = [[lockedSession], [committedRequest]]
    const select = vi.fn(() => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {}
      query.from = vi.fn().mockReturnValue(query)
      query.where = vi.fn().mockReturnValue(query)
      query.limit = vi.fn().mockReturnValue(query)
      query.for = vi.fn().mockResolvedValue(lockedRows.shift() ?? [])
      return query
    })
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    })
    const transaction = { select, insert } as unknown as DatabaseTransaction
    const probe = service(true, [tenantId])
    vi.mocked(lockProjectDocumentStorageForCreate).mockRejectedValue(
      new Error('quota should not be consulted for a committed replay')
    )
    const commit = (
      probe.service as unknown as PublicSigningCommitBoundary
    ).commit.bind(probe.service)

    await expect(
      commit(
        transaction,
        sessionId,
        tenantId,
        'token-hash',
        `${tenantId}/signatures/contract/${entityId}/signature.png`,
        1024,
        { signerName: 'Ana Reyes', signerEmail: 'ana@example.com' },
        'public-sign-1',
        requestHash
      )
    ).resolves.toEqual(result)
    expect(lockProjectDocumentStorageForCreate).not.toHaveBeenCalled()
  })

  it('locks the source before quota and commits a new signature atomically', async () => {
    const tenantId = '22222222-2222-4222-8222-222222222222'
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const entityId = '33333333-3333-4333-8333-333333333333'
    const documentId = '44444444-4444-4444-8444-444444444444'
    const projectId = '55555555-5555-4555-8555-555555555555'
    const requestId = '66666666-6666-4666-8666-666666666666'
    const requestHash = 'request-hash'
    const lockedSession = {
      id: sessionId,
      tenant_id: tenantId,
      token_hash: 'token-hash',
      entity_type: 'contract',
      entity_id: entityId,
      signed_at: null,
      revoked_at: null,
      expires_at: new Date('2099-01-01T00:00:00.000Z'),
    }
    const sessionLock = vi.fn().mockResolvedValue([lockedSession])
    const requestLock = vi.fn().mockResolvedValue([
      {
        id: requestId,
        requestHash,
        state: 'processing',
        result: null,
      },
    ])
    const sourceLock = vi.fn().mockResolvedValue([{ projectId }])
    const select = vi.fn(() => {
      const query: Record<string, ReturnType<typeof vi.fn>> = {}
      query.from = vi.fn((table: unknown) => {
        query.where = vi.fn().mockReturnValue(query)
        query.limit = vi.fn().mockReturnValue(query)
        query.for =
          table === signatureSessions
            ? sessionLock
            : table === publicSigningRequests
              ? requestLock
              : sourceLock
        return query
      })
      return query
    })
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn().mockReturnValue(
        table === publicSigningRequests
          ? { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
          : { returning: vi.fn().mockResolvedValue([{ id: documentId }]) }
      ),
    }))
    const update = vi.fn((table: unknown) => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(
            table === contracts
              ? [{ id: entityId }]
              : table === signatureSessions
                ? [{ id: sessionId }]
                : [{ id: requestId }]
          ),
        }),
      }),
    }))
    const transaction = {
      select,
      insert,
      update,
    } as unknown as DatabaseTransaction
    const audit = {
      writeSemantic: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditService
    const signingService = new PublicSigningService(
      {} as ConfigService,
      {} as DatabaseService,
      audit,
      {} as PublicSigningStorageService
    )
    vi.mocked(lockProjectDocumentStorageForCreate).mockReset()
    vi.mocked(lockProjectDocumentStorageForCreate).mockResolvedValue({
      committedBytes: 0n,
      activeReservationBytes: 0n,
      totalBytes: 0n,
    })
    const commit = (
      signingService as unknown as PublicSigningCommitBoundary
    ).commit.bind(signingService)

    await expect(
      commit(
        transaction,
        sessionId,
        tenantId,
        'token-hash',
        `${tenantId}/signatures/contract/${entityId}/signature.png`,
        1024,
        { signerName: 'Ana Reyes', signerEmail: 'ana@example.com' },
        'public-sign-1',
        requestHash
      )
    ).resolves.toMatchObject({
      sessionId,
      tenantId,
      entityType: 'contract',
      entityId,
      signatureDocumentId: documentId,
    })
    expect(sourceLock).toHaveBeenCalledBefore(
      vi.mocked(lockProjectDocumentStorageForCreate)
    )
    expect(lockProjectDocumentStorageForCreate).toHaveBeenCalledWith(
      transaction,
      { tenantId, projectId },
      1024
    )
    expect(insert).toHaveBeenCalledWith(documents)
    expect(audit.writeSemantic).toHaveBeenCalledOnce()
  })
})
