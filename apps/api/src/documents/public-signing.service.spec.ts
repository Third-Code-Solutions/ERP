import 'reflect-metadata'

import { createHash } from 'node:crypto'
import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { publicSigningRequests, signatureSessions } from '@third-code-erp/database/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import type { PublicSigningStorageService } from './public-signing.storage'
import { PublicSigningService } from './public-signing.service'

const awardMock = vi.hoisted(() => ({ runSignedBomAward: vi.fn() }))
vi.mock('@third-code-erp/operations/signed-bom-award', () => awardMock)

const BODY = {
  signerName: 'Ana Reyes',
  signerEmail: 'ana@example.com',
  signatureDataUrl: 'data:image/png;base64,abc=',
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_PUBLIC_SIGNING_WRITES_ENABLED' ? enabled : tenantIds
    ),
  } as unknown as ConfigService
  const select = vi.fn()
  const database = {
    client: { select },
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
    storage,
  }
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

  it('returns the saved result for an exact retry after the signing session is consumed', async () => {
    const tenantId = '22222222-2222-4222-8222-222222222222'
    const token = 'a'.repeat(64)
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const requestHash = createHash('sha256')
      .update(JSON.stringify({
        signatureDataUrl: BODY.signatureDataUrl,
        signerEmail: BODY.signerEmail,
        signerName: BODY.signerName,
        tokenHash,
      }))
      .digest('hex')
    const result = {
      sessionId: '11111111-1111-4111-8111-111111111111',
      tenantId,
      entityType: 'bom',
      entityId: '33333333-3333-4333-8333-333333333333',
      signatureDocumentId: '44444444-4444-4444-8444-444444444444',
      signedAt: '2026-09-28T00:00:00.000Z',
    }
    const probe = service(true, [tenantId])
    const rows = [
      [{ tenant_id: tenantId, signed_at: new Date(), revoked_at: null, expires_at: new Date('2030-01-01') }],
      [{ requestHash, state: 'succeeded', result }],
    ]
    probe.select.mockImplementation(() => {
      const chain = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn().mockResolvedValue(rows.shift()),
      }
      chain.from.mockReturnValue(chain)
      chain.where.mockReturnValue(chain)
      return chain
    })

    await expect(probe.service.sign(token, BODY, 'public-sign-1')).resolves.toEqual(result)
    expect(probe.storage.upload).not.toHaveBeenCalled()
  })

  it('requires an approved BOM in the tenant before recording a signature', async () => {
    const probe = service()
    const returning = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ returning })
    const update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where }),
    })
    const stamp = probe.service['stampSignedSource']
    // This double exercises only the BOM update path of a much larger transaction interface.
    const transaction = { update } as unknown as Parameters<typeof stamp>[0]
    const session = {
      entity_type: 'bom',
      entity_id: '33333333-3333-4333-8333-333333333333',
      tenant_id: '22222222-2222-4222-8222-222222222222',
    } as Parameters<typeof stamp>[1]

    await expect(
      stamp.call(probe.service, transaction, session, 'signature-document', new Date())
    ).resolves.toBe(false)

    const predicate = where.mock.calls[0]?.[0]
    const compiled = new PgDialect().sqlToQuery(predicate)
    expect(compiled.sql).toContain('"boms"."tenant_id"')
    expect(compiled.sql).toContain('"boms"."status"')
    expect(compiled.params).toContain('approved')
  })

  it.each([
    ['variation_order', 'variation_orders', 'pending_client_signature'],
    ['coc', 'certificates_of_completion', 'pending_signature'],
  ] as const)(
    'refuses with 409 to stamp a %s that no longer waits for a signature',
    async (entityType, table, pendingStatus) => {
      const probe = service()
      const returning = vi.fn().mockResolvedValue([])
      const where = vi.fn().mockReturnValue({ returning })
      const set = vi.fn().mockReturnValue({ where })
      const update = vi.fn().mockReturnValue({ set })
      const stamp = probe.service['stampSignedSource']
      // This double exercises only the source update path of a much larger transaction interface.
      const transaction = { update } as unknown as Parameters<typeof stamp>[0]
      const session = {
        entity_type: entityType,
        entity_id: '33333333-3333-4333-8333-333333333333',
        tenant_id: '22222222-2222-4222-8222-222222222222',
      } as Parameters<typeof stamp>[1]

      await expect(
        stamp.call(probe.service, transaction, session, 'signature-document', new Date())
      ).rejects.toBeInstanceOf(ConflictException)

      const compiled = new PgDialect().sqlToQuery(where.mock.calls[0]?.[0])
      expect(compiled.sql).toContain(`"${table}"."tenant_id"`)
      expect(compiled.sql).toContain(`"${table}"."status"`)
      expect(compiled.params).toEqual([
        '33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222',
        pendingStatus,
      ])
    }
  )

  it('does not acknowledge a BOM signature when atomic award creation fails', async () => {
    awardMock.runSignedBomAward.mockReset()
    awardMock.runSignedBomAward.mockRejectedValue(new Error('Budget baseline failed'))
    const tenantId = '22222222-2222-4222-8222-222222222222'
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const bomId = '33333333-3333-4333-8333-333333333333'
    const session = {
      id: sessionId,
      tenant_id: tenantId,
      entity_type: 'bom',
      entity_id: bomId,
      signed_at: null,
      revoked_at: null,
      expires_at: new Date('2030-01-01T00:00:00.000Z'),
    }
    const selected = [
      [session],
      [{ id: '55555555-5555-4555-8555-555555555555', requestHash: 'request-hash', state: 'processing', result: null }],
    ]
    const select = vi.fn(() => {
      const chain = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(),
        for: vi.fn().mockResolvedValue(selected.shift()),
      }
      chain.from.mockReturnValue(chain)
      chain.where.mockReturnValue(chain)
      chain.limit.mockReturnValue(chain)
      return chain
    })
    const insert = vi.fn((table: unknown) => {
      expect(table).toBe(publicSigningRequests)
      const conflict = vi.fn().mockResolvedValue(undefined)
      return { values: vi.fn().mockReturnValue({ onConflictDoNothing: conflict }) }
    })
    const update = vi.fn()
    const tx = { select, insert, update }
    const probe = service()
    probe.service['createSignedDocument'] = vi.fn().mockResolvedValue(
      '44444444-4444-4444-8444-444444444444'
    )
    probe.service['stampSignedSource'] = vi.fn().mockResolvedValue(true)
    const commit = probe.service['commit']

    await expect(commit.call(
      probe.service,
      tx as unknown as Parameters<typeof commit>[0],
      sessionId,
      tenantId,
      'token-hash',
      '66666666-6666-4666-8666-666666666666',
      'signature.png',
      500,
      { signerName: 'Ana Reyes', signerEmail: 'ana@example.com' },
      'public-sign-1',
      'request-hash'
    )).rejects.toThrow('Budget baseline failed')
    expect(awardMock.runSignedBomAward).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ tenantId, bomId, actorId: null })
    )
    expect(update).not.toHaveBeenCalledWith(signatureSessions)
  })

  it('replays a concurrent exact retry after acquiring the consumed session lock', async () => {
    awardMock.runSignedBomAward.mockReset()
    const tenantId = '22222222-2222-4222-8222-222222222222'
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const bomId = '33333333-3333-4333-8333-333333333333'
    const result = {
      sessionId,
      tenantId,
      entityType: 'bom',
      entityId: bomId,
      signatureDocumentId: '44444444-4444-4444-8444-444444444444',
      signedAt: '2026-09-28T00:00:00.000Z',
    }
    const selected = [
      [{ id: sessionId, tenant_id: tenantId, entity_type: 'bom', entity_id: bomId,
        signed_at: new Date(), revoked_at: null, expires_at: new Date('2030-01-01') }],
      [{ id: '55555555-5555-4555-8555-555555555555', requestHash: 'request-hash',
        state: 'succeeded', result }],
    ]
    const select = vi.fn(() => {
      const chain = {
        from: vi.fn(),
        where: vi.fn(),
        limit: vi.fn(),
        for: vi.fn().mockResolvedValue(selected.shift()),
      }
      chain.from.mockReturnValue(chain)
      chain.where.mockReturnValue(chain)
      chain.limit.mockReturnValue(chain)
      return chain
    })
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }),
    })
    const update = vi.fn()
    const tx = { select, insert, update }
    const probe = service()
    const commit = probe.service['commit']

    await expect(commit.call(
      probe.service,
      tx as unknown as Parameters<typeof commit>[0],
      sessionId,
      tenantId,
      'token-hash',
      '66666666-6666-4666-8666-666666666666',
      'signature.png',
      500,
      { signerName: 'Ana Reyes' },
      'public-sign-1',
      'request-hash'
    )).resolves.toEqual(result)
    expect(update).not.toHaveBeenCalled()
    expect(awardMock.runSignedBomAward).not.toHaveBeenCalled()
  })
})
