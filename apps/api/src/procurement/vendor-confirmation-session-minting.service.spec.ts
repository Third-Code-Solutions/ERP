import 'reflect-metadata'

import { ConflictException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseTransaction } from '../database/database.service'
import { deriveVendorConfirmationToken, hashVendorConfirmationToken } from './vendor-confirmation-token'
import { VendorConfirmationSessionMintingService } from './vendor-confirmation-session-minting.service'

const TENANT = '22222222-2222-4222-8222-222222222222'
const PO = '33333333-3333-4333-8333-333333333333'
const VENDOR = '44444444-4444-4444-8444-444444444444'
const REQUEST = '55555555-5555-4555-8555-555555555555'
const USER = '66666666-6666-4666-8666-666666666666'
const SECRET = 't'.repeat(32)

function config(options: {
  enabled?: boolean
  tenants?: string[]
  secret?: string
  ttlHours?: number
}) {
  return {
    get: vi.fn((key: string, fallback?: unknown) => {
      if (key === 'ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED') {
        return options.enabled ?? false
      }
      if (key === 'ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS') {
        return options.tenants ?? []
      }
      if (key === 'ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET') {
        return options.secret
      }
      if (key === 'ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS') {
        return options.ttlHours ?? fallback
      }
      return fallback
    }),
  } as unknown as ConfigService
}

function input(transaction: DatabaseTransaction) {
  return {
    transaction,
    tenantId: TENANT,
    purchaseOrderId: PO,
    vendorId: VENDOR,
    sourceWorkflowRequestId: REQUEST,
    createdBy: USER,
  }
}

function query(result: unknown[]) {
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
  return chain
}

function transaction(results: unknown[][]) {
  const select = vi.fn(() => query(results.shift() ?? []))
  const insertQuery = {
    values: vi.fn(),
    onConflictDoNothing: vi.fn(),
  }
  insertQuery.values.mockReturnValue(insertQuery)
  insertQuery.onConflictDoNothing.mockResolvedValue(undefined)
  return {
    transaction: { select, insert: vi.fn(() => insertQuery) } as unknown as DatabaseTransaction,
    select,
    insertQuery,
  }
}

describe('VendorConfirmationSessionMintingService', () => {
  it('stays closed without reading the database', async () => {
    const tx = transaction([])
    const service = new VendorConfirmationSessionMintingService(config({}))
    await expect(service.mint(input(tx.transaction))).resolves.toBeNull()
    expect(tx.select).not.toHaveBeenCalled()
  })

  it('requires the server-only token secret before any write', async () => {
    const tx = transaction([])
    const service = new VendorConfirmationSessionMintingService(
      config({ enabled: true, tenants: [TENANT] })
    )
    await expect(service.mint(input(tx.transaction))).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(tx.select).not.toHaveBeenCalled()
  })

  it('rejects an invalid TTL before writing a session', async () => {
    const tx = transaction([])
    const service = new VendorConfirmationSessionMintingService(
      config({
        enabled: true,
        tenants: [TENANT],
        secret: SECRET,
        ttlHours: 0,
      })
    )
    await expect(service.mint(input(tx.transaction))).rejects.toBeInstanceOf(
      ServiceUnavailableException
    )
    expect(tx.select).not.toHaveBeenCalled()
  })

  it('mints a deterministic-session record with a redacted association', async () => {
    const tx = transaction([[], [], [{
      id: '77777777-7777-4777-8777-777777777777',
      purchaseOrderId: PO,
      vendorId: VENDOR,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    }]])
    const service = new VendorConfirmationSessionMintingService(
      config({ enabled: true, tenants: [TENANT], secret: SECRET })
    )
    const result = await service.mint(input(tx.transaction))
    expect(result).toMatchObject({
      sessionId: '77777777-7777-4777-8777-777777777777',
    })
    const values = tx.insertQuery.values.mock.calls[0]?.[0] as Record<string, unknown>
    expect(values).toMatchObject({
      tenant_id: TENANT,
      purchase_order_id: PO,
      vendor_id: VENDOR,
      source_workflow_request_id: REQUEST,
      created_by: USER,
    })
    const token = deriveVendorConfirmationToken(
      SECRET,
      TENANT,
      values.id as string
    )
    expect(values.token_hash).toBe(hashVendorConfirmationToken(token))
    expect(JSON.stringify(values)).not.toContain(token)
  })

  it('reuses a compatible pending session and rejects scope drift', async () => {
    const existing = {
      id: '77777777-7777-4777-8777-777777777777',
      purchaseOrderId: PO,
      vendorId: VENDOR,
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    }
    const tx = transaction([[existing]])
    const service = new VendorConfirmationSessionMintingService(
      config({ enabled: true, tenants: [TENANT], secret: SECRET })
    )
    await expect(service.mint(input(tx.transaction))).resolves.toMatchObject({
      sessionId: existing.id,
    })
    expect(tx.insertQuery.values).not.toHaveBeenCalled()

    const driftTx = transaction([[{ ...existing, vendorId: '88888888-8888-4888-8888-888888888888' }]])
    await expect(service.mint(input(driftTx.transaction))).rejects.toBeInstanceOf(
      ConflictException
    )
  })
})
