import 'reflect-metadata'

import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import type { PublicSigningStorageService } from './public-signing.storage'
import { PublicSigningService } from './public-signing.service'

const BODY = {
  signerName: 'Ana Reyes',
  signerEmail: 'ana@example.com',
  signatureDataUrl: 'data:image/png;base64,abc=',
}

function service(
  enabled = false,
  tenantIds: string[] = [],
  session?: Record<string, unknown>
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
})
