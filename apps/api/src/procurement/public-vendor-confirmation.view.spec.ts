import 'reflect-metadata'

import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { PublicVendorConfirmationService } from './public-vendor-confirmation.service'
import { deriveVendorConfirmationToken } from './vendor-confirmation-token'

const TENANT = '22222222-2222-4222-8222-222222222222'
const SESSION = '33333333-3333-4333-8333-333333333333'
const PO = '44444444-4444-4444-8444-444444444444'
const VENDOR = '55555555-5555-4555-8555-555555555555'
const LINE = '66666666-6666-4666-8666-666666666666'
const TOKEN = deriveVendorConfirmationToken('v'.repeat(32), TENANT, SESSION)

function chain<T>(result: T[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
  }
  query.from.mockReturnValue(query)
  query.innerJoin.mockReturnValue(query)
  query.where.mockReturnValue(query)
  query.limit.mockResolvedValue(result)
  query.orderBy.mockResolvedValue(result)
  return query
}

function config(enabled: boolean, tenantIds: string[] = [TENANT]) {
  return {
    get: vi.fn((key: string, fallback?: unknown) => {
      if (key === 'ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED') return enabled
      if (key === 'ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS') {
        return tenantIds
      }
      return fallback
    }),
  } as unknown as ConfigService
}

describe('public supplier confirmation review', () => {
  it('fails closed before token or database work', async () => {
    const select = vi.fn()
    const service = new PublicVendorConfirmationService(
      config(false),
      { client: { select } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(service.view(TOKEN)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(select).not.toHaveBeenCalled()
  })

  it('returns a token-scoped order view and line items', async () => {
    const order = chain([
      {
        sessionId: SESSION,
        sessionTenantId: TENANT,
        purchaseOrderId: PO,
        vendorId: VENDOR,
        state: 'pending',
        revokedAt: null,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        poNumber: 'PO-0042',
        projectName: 'Harbor Point',
        projectLocation: 'Makati',
        vendorName: 'Harbor Supply',
        deliveryDate: new Date('2098-12-01T00:00:00.000Z'),
        notes: 'Call site office before delivery.',
        subtotalCents: 100_000,
        vatCents: 12_000,
        withholdingTaxCents: 2_000,
        totalCents: 110_000,
      },
    ])
    const lines = chain([
      {
        id: LINE,
        description: 'Ready-mix concrete',
        unit: 'm3',
        quantity: 10,
        quantityMicros: 10_000_000,
        unitCostCents: 10_000,
        lineTotalCents: 100_000,
      },
    ])
    const select = vi.fn().mockReturnValueOnce(order).mockReturnValueOnce(lines)
    const service = new PublicVendorConfirmationService(
      config(true),
      { client: { select } } as unknown as DatabaseService,
      {} as AuditService
    )

    const result = await service.view(TOKEN)

    expect(result).toMatchObject({
      sessionId: SESSION,
      purchaseOrderId: PO,
      poNumber: 'PO-0042',
      vendorName: 'Harbor Supply',
      projectName: 'Harbor Point',
      state: 'pending',
      totalCents: 110_000,
    })
    expect(result.lines).toHaveLength(1)
    expect(result).not.toHaveProperty('tenantId')
    expect(result).not.toHaveProperty('tokenHash')
  })

  it('returns a read-only state for an answered session', async () => {
    const order = chain([
      {
        sessionId: SESSION,
        sessionTenantId: TENANT,
        purchaseOrderId: PO,
        vendorId: VENDOR,
        state: 'accepted',
        revokedAt: null,
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        poNumber: 'PO-0042',
        projectName: 'Harbor Point',
        projectLocation: null,
        vendorName: 'Harbor Supply',
        deliveryDate: null,
        notes: null,
        subtotalCents: 0,
        vatCents: 0,
        withholdingTaxCents: 0,
        totalCents: 0,
      },
    ])
    const lines = chain([])
    const select = vi.fn().mockReturnValueOnce(order).mockReturnValueOnce(lines)
    const service = new PublicVendorConfirmationService(
      config(true),
      { client: { select } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(service.view(TOKEN)).resolves.toMatchObject({
      state: 'accepted',
    })
  })

  it('rejects expired links without returning order data', async () => {
    const order = chain([
      {
        sessionId: SESSION,
        sessionTenantId: TENANT,
        purchaseOrderId: PO,
        vendorId: VENDOR,
        state: 'pending',
        revokedAt: null,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        poNumber: 'PO-0042',
        projectName: 'Harbor Point',
        projectLocation: null,
        vendorName: 'Harbor Supply',
        deliveryDate: null,
        notes: null,
        subtotalCents: 0,
        vatCents: 0,
        withholdingTaxCents: 0,
        totalCents: 0,
      },
    ])
    const select = vi.fn().mockReturnValue(order)
    const service = new PublicVendorConfirmationService(
      config(true),
      { client: { select } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(service.view(TOKEN)).rejects.toBeInstanceOf(ConflictException)
  })
})
