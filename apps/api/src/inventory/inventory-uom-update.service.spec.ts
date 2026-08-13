import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { UpdateInventoryUomCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { InventoryUomUpdateService } from './inventory-uom-update.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}

const UOM_ID = '66666666-6666-4666-8666-666666666666'
const COMMAND: UpdateInventoryUomCommand = {
  name: 'Units',
  isActive: false,
}

function service(
  enabled = false,
  tenantIds: string[] = [],
  transaction = vi.fn(),
  audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_INVENTORY_UOM_UPDATE_WRITES_ENABLED' ? enabled : tenantIds
    ),
  } as unknown as ConfigService
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    candidate: new InventoryUomUpdateService(
      config,
      database,
      audit as unknown as AuditService
    ),
    transaction,
    audit,
  }
}

describe('InventoryUomUpdateService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const { candidate, transaction } = service()

    await expect(
      candidate.update(UOM_ID, COMMAND, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('locks the tenant UOM, updates mutable state, and audits the diff', async () => {
    const membership = {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    }
    const existing = {
      id: UOM_ID,
      code: 'EA',
      name: 'Each',
      decimalPlaces: 0,
      isActive: true,
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    }
    const updated = {
      ...existing,
      name: COMMAND.name,
      isActive: COMMAND.isActive,
      updatedAt: new Date('2026-08-05T00:01:00.000Z'),
    }
    const selectQuery = (rows: unknown[]) => {
      const rowLock = vi.fn().mockResolvedValue(rows)
      const limit = vi.fn().mockReturnValue({
        for: rowLock,
        then: (
          resolve: (value: unknown[]) => unknown,
          reject: (reason: unknown) => unknown
        ) => Promise.resolve(rows).then(resolve, reject),
      })
      const where = vi.fn().mockReturnValue({ limit })
      const from = vi.fn().mockReturnValue({ where })
      return { from }
    }
    const membershipQuery = selectQuery([membership])
    const uomQuery = selectQuery([existing])
    const updateReturning = vi.fn().mockResolvedValue([updated])
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning })
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membershipQuery.from })
        .mockReturnValueOnce({ from: uomQuery.from }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }
    const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient)
    )
    const { candidate, audit } = service(
      true,
      [PRINCIPAL.tenantId],
      transaction
    )

    await expect(candidate.update(UOM_ID, COMMAND, PRINCIPAL)).resolves.toEqual({
      uomId: UOM_ID,
      tenantId: PRINCIPAL.tenantId,
      code: 'EA',
      name: COMMAND.name,
      decimalPlaces: 0,
      isActive: false,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:01:00.000Z',
    })
    expect(transactionClient.update).toHaveBeenCalledOnce()
    expect(updateSet).toHaveBeenCalledWith({
      name: COMMAND.name,
      is_active: false,
      updated_at: expect.any(Date),
    })
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).toHaveBeenCalledWith(
      transactionClient,
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        entityType: 'unit_of_measure',
        entityId: UOM_ID,
        action: 'update',
        diff: {
          before: { name: 'Each', is_active: true },
          after: { name: 'Units', is_active: false },
        },
      })
    )
  })
})
