import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
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
  return {
    service: new PublicSigningService(
      config,
      database,
      {} as AuditService,
      {} as PublicSigningStorageService
    ),
    select,
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
})
