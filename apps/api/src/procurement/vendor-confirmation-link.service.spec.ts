import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseTransaction } from '../database/database.service'
import { deriveVendorConfirmationToken } from './vendor-confirmation-token'
import { VendorConfirmationLinkService } from './vendor-confirmation-link.service'

const TENANT = '22222222-2222-4222-8222-222222222222'
const PO = '33333333-3333-4333-8333-333333333333'
const SESSION = '77777777-7777-4777-8777-777777777777'
const SECRET = 's'.repeat(32)

function config(values: Record<string, unknown>) {
  return {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService
}

function transaction(result: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    for: vi.fn(),
  }
  chain.from.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.for.mockResolvedValue(result)
  const select = vi.fn(() => chain)
  return {
    transaction: { select } as unknown as DatabaseTransaction,
    select,
  }
}

function input(tx: DatabaseTransaction, sessionId: string | null = SESSION) {
  return {
    transaction: tx,
    tenantId: TENANT,
    purchaseOrderId: PO,
    sessionId,
  }
}

const ENABLED = {
  ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED: true,
  ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS: [TENANT],
  ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED: true,
  ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS: [TENANT],
  ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET: SECRET,
  ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL:
    'https://third-code-erp-api.example.test',
}

describe('VendorConfirmationLinkService', () => {
  it('stays closed without a session or database read', async () => {
    const tx = transaction([])
    const service = new VendorConfirmationLinkService(config(ENABLED))

    await expect(service.buildUrl(input(tx.transaction, null))).resolves.toBeNull()
    expect(tx.select).not.toHaveBeenCalled()
  })

  it('stays closed until both link and public-write tenant gates are enabled', async () => {
    const tx = transaction([])
    const service = new VendorConfirmationLinkService(
      config({
        ...ENABLED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED: false,
      })
    )

    await expect(service.buildUrl(input(tx.transaction))).resolves.toBeNull()
    expect(tx.select).not.toHaveBeenCalled()
  })

  it('reconstructs a link only for a matching, pending, unexpired session', async () => {
    const tx = transaction([{ id: SESSION }])
    const service = new VendorConfirmationLinkService(config(ENABLED))

    const result = await service.buildUrl(input(tx.transaction))
    const token = deriveVendorConfirmationToken(SECRET, TENANT, SESSION)
    expect(result).toBe(
      `https://third-code-erp-api.example.test/v1/public/purchase-orders/${token}/confirmation`
    )
    expect(JSON.stringify({ result })).toContain(token)
  })

  it('returns no link when the session is no longer eligible', async () => {
    const tx = transaction([])
    const service = new VendorConfirmationLinkService(config(ENABLED))

    await expect(service.buildUrl(input(tx.transaction))).resolves.toBeNull()
  })

  it('fails closed before database access when link configuration is incomplete', async () => {
    const tx = transaction([])
    const service = new VendorConfirmationLinkService(
      config({
        ...ENABLED,
        ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET: undefined,
      })
    )

    await expect(service.buildUrl(input(tx.transaction))).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(tx.select).not.toHaveBeenCalled()
  })
})
