import 'reflect-metadata'

import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { UpdateInventoryWarehouseCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { InventoryWarehouseUpdateService } from './inventory-warehouse-update.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}

const WAREHOUSE_ID = '33333333-3333-4333-8333-333333333333'
const COMMAND: UpdateInventoryWarehouseCommand = {
  name: 'Closed materials store',
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
      key === 'ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  return {
    candidate: new InventoryWarehouseUpdateService(
      config,
      database,
      audit as unknown as AuditService
    ),
    transaction,
    audit,
  }
}

describe('InventoryWarehouseUpdateService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const { candidate, transaction } = service()

    await expect(
      candidate.update(WAREHOUSE_ID, COMMAND, PRINCIPAL)
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('locks the tenant Warehouse, updates only mutable state, and audits the diff', async () => {
    const membership = {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    }
    const existing = {
      id: WAREHOUSE_ID,
      code: 'MAIN',
      name: 'Main store',
      projectId: null,
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
      return { from, where, limit, rowLock }
    }
    const membershipQuery = selectQuery([membership])
    const warehouseQuery = selectQuery([existing])
    const updateReturning = vi.fn().mockResolvedValue([updated])
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning })
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membershipQuery.from })
        .mockReturnValueOnce({ from: warehouseQuery.from }),
      execute: vi.fn().mockResolvedValue([
        { quantity_micros: '0', value_cents: '0' },
      ]),
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

    await expect(
      candidate.update(WAREHOUSE_ID, COMMAND, PRINCIPAL)
    ).resolves.toEqual({
      warehouseId: WAREHOUSE_ID,
      tenantId: PRINCIPAL.tenantId,
      code: 'MAIN',
      name: COMMAND.name,
      projectId: null,
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
        entityType: 'warehouse',
        entityId: WAREHOUSE_ID,
        action: 'update',
        diff: {
          before: { name: 'Main store', is_active: true },
          after: { name: COMMAND.name, is_active: false },
        },
      })
    )
  })

  it('rejects deactivation while net stock quantity or value remains', async () => {
    const membership = {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    }
    const existing = {
      id: WAREHOUSE_ID,
      code: 'MAIN',
      name: 'Main store',
      projectId: null,
      isActive: true,
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      updatedAt: new Date('2026-08-05T00:00:00.000Z'),
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
    const warehouseQuery = selectQuery([existing])
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membershipQuery.from })
        .mockReturnValueOnce({ from: warehouseQuery.from }),
      execute: vi.fn().mockResolvedValue([
        { quantity_micros: '1000000', value_cents: '12500' },
      ]),
      update: vi.fn(),
    }
    const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient)
    )
    const { candidate, audit } = service(
      true,
      [PRINCIPAL.tenantId],
      transaction
    )

    await expect(
      candidate.update(WAREHOUSE_ID, COMMAND, PRINCIPAL)
    ).rejects.toMatchObject({
      constructor: ConflictException,
      message:
        'Warehouse cannot be deactivated while its net stock balance is nonzero.',
    })
    expect(transactionClient.update).not.toHaveBeenCalled()
    expect(audit.writeSemantic).not.toHaveBeenCalled()
  })
})
