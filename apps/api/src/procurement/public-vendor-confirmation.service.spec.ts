import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { PublicVendorConfirmationService } from './public-vendor-confirmation.service'

const BODY = {
  decision: 'accepted' as const,
  responderName: 'Ana Reyes',
  responderEmail: 'ana@example.com',
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  }
  query.from.mockReturnValue(query)
  query.where.mockReturnValue(query)
  query.limit.mockResolvedValue([])
  const select = vi.fn(() => query)
  const database = {
    client: { select },
  } as unknown as DatabaseService
  return {
    service: new PublicVendorConfirmationService(
      config,
      database,
      {} as AuditService
    ),
    select,
  }
}

describe('public supplier confirmation migration boundary', () => {
  it('fails closed before token or database work when disabled', async () => {
    const probe = service()
    await expect(
      probe.service.confirm('b'.repeat(64), BODY, 'vendor-confirm-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.select).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    const probe = service(true)
    await expect(
      probe.service.confirm('b'.repeat(64), BODY, 'vendor-confirm-1')
    ).rejects.toThrow(
      'Supplier confirmation is not enabled for this tenant; no response was recorded.'
    )
    expect(probe.select).not.toHaveBeenCalled()
  })

  it('does not treat an unknown token as an enabled write', async () => {
    const probe = service(true, ['11111111-1111-4111-8111-111111111111'])
    await expect(
      probe.service.confirm('b'.repeat(64), BODY, 'vendor-confirm-1')
    ).rejects.toThrow('Invalid supplier confirmation link.')
    expect(probe.select).toHaveBeenCalledTimes(1)
  })
})
