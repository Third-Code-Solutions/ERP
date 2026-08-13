import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { ConfigureInventoryItemCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { InventoryItemConfigurationService } from './inventory-item-configuration.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}

const COMMAND: ConfigureInventoryItemCommand = {
  uomId: '33333333-3333-4333-8333-333333333333',
  tracked: true,
}

function service(
  enabled = false,
  tenantIds: string[] = [],
  transaction = vi.fn(),
  audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_INVENTORY_ITEM_CONFIG_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  return {
    candidate: new InventoryItemConfigurationService(
      config,
      database,
      audit as unknown as AuditService
    ),
    transaction,
    audit,
  }
}

describe('InventoryItemConfigurationService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const { candidate, transaction } = service()

    await expect(
      candidate.configure(
        '44444444-4444-4444-8444-444444444444',
        COMMAND,
        PRINCIPAL
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when the tenant allowlist is empty', async () => {
    await expect(
      service(true).candidate.configure(
        '44444444-4444-4444-8444-444444444444',
        COMMAND,
        PRINCIPAL
      )
    ).rejects.toThrow(
      'Inventory item configuration is not enabled for this tenant; no item was changed.'
    )
  })

  it('locks the tenant-scoped item and audits a changed policy', async () => {
    const membership = {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    }
    const existing = {
      id: '44444444-4444-4444-8444-444444444444',
      baseUomId: '55555555-5555-4555-8555-555555555555',
      inventoryTracked: false,
      unit: 'EA',
      updatedAt: new Date('2026-08-04T00:00:00.000Z'),
    }
    const updated = {
      id: existing.id,
      baseUomId: COMMAND.uomId,
      inventoryTracked: true,
      unit: 'EA',
      updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    }
    const selectQuery = (rows: unknown[]) => {
      const rowLock = vi.fn().mockResolvedValue(rows)
      const limit = vi.fn().mockReturnValue({ for: rowLock })
      const where = vi.fn().mockReturnValue({ limit })
      const from = vi.fn().mockReturnValue({ where })
      return { from, where, limit, rowLock }
    }
    const userQuery = selectQuery([membership])
    const uomQuery = selectQuery([{ id: COMMAND.uomId, code: 'EA' }])
    const itemQuery = selectQuery([existing])
    const updateReturning = vi.fn().mockResolvedValue([updated])
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning })
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: userQuery.from })
        .mockReturnValueOnce({ from: uomQuery.from })
        .mockReturnValueOnce({ from: itemQuery.from }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }
    const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient)
    )
    const { candidate, audit } = service(true, [PRINCIPAL.tenantId], transaction)

    await expect(
      candidate.configure(existing.id, COMMAND, PRINCIPAL)
    ).resolves.toEqual({
      materialItemId: existing.id,
      tenantId: PRINCIPAL.tenantId,
      baseUomId: COMMAND.uomId,
      inventoryTracked: true,
      unit: 'EA',
      updatedAt: '2026-08-05T00:00:00.000Z',
    })
    expect(transactionClient.update).toHaveBeenCalledOnce()
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).toHaveBeenCalledWith(
      transactionClient,
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        entityType: 'material_item',
        entityId: existing.id,
        action: 'update',
      })
    )
  })
})
