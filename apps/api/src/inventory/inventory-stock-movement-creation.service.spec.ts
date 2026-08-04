import 'reflect-metadata'

import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { CreateStockMovementCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { InventoryStockMovementCreationService } from './inventory-stock-movement-creation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}

const COMMAND: CreateStockMovementCommand = {
  movementType: 'transfer',
  sourceWarehouseId: '33333333-3333-4333-8333-333333333333',
  targetWarehouseId: '44444444-4444-4444-8444-444444444444',
  projectId: null,
  movementDate: '2026-08-05',
  reason: 'Move accepted materials',
  lines: [
    {
      materialItemId: '55555555-5555-4555-8555-555555555555',
      quantity: '1.25',
      costCodeId: null,
      declaredUnitCostPhp: null,
    },
  ],
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    candidate: new InventoryStockMovementCreationService(
      config,
      database,
      {} as AuditService
    ),
    transaction,
  }
}

function selectQuery(rows: unknown[]) {
  const rowLock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: rowLock })
  const where = vi.fn().mockReturnValue({ limit, for: rowLock })
  const from = vi.fn().mockReturnValue({ where })
  return { from, where, limit, rowLock }
}

describe('InventoryStockMovementCreationService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const { candidate, transaction } = service()

    await expect(
      candidate.create(COMMAND, PRINCIPAL, 'movement-create-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when the tenant allowlist is empty', async () => {
    await expect(
      service(true).candidate.create(COMMAND, PRINCIPAL, 'movement-create-1')
    ).rejects.toThrow(
      'Stock Movement creation is not enabled for this tenant; no Stock Movement was created.'
    )
  })

  it('rejects an invalid retry key before opening a transaction', async () => {
    const { candidate, transaction } = service(true, [PRINCIPAL.tenantId])

    await expect(candidate.create(COMMAND, PRINCIPAL, '   ')).rejects.toBeInstanceOf(
      BadRequestException
    )
    expect(transaction).not.toHaveBeenCalled()
  })

  it('creates a draft movement, records idempotency, and audits inside one transaction', async () => {
    const membership = {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    }
    const source = { id: COMMAND.sourceWarehouseId, projectId: null }
    const target = { id: COMMAND.targetWarehouseId, projectId: null }
    const item = {
      id: COMMAND.lines[0]!.materialItemId,
      uomId: '66666666-6666-4666-8666-666666666666',
      description: 'Ready-mix concrete',
    }
    const request = {
      id: '77777777-7777-4777-8777-777777777777',
      requestHash: '',
      state: 'processing',
      result: null,
    }
    const created = { id: '88888888-8888-4888-8888-888888888888' }
    const completed = { id: request.id }
    const membershipQuery = selectQuery([membership])
    const requestQuery = selectQuery([request])
    const sourceQuery = selectQuery([source])
    const targetQuery = selectQuery([target])
    const itemQuery = selectQuery([item])
    const insertRequestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn().mockReturnValue(undefined) }
    })
    const insertMovementValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([created]),
    })
    const insertLinesValues = vi.fn().mockReturnValue(undefined)
    const updateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([completed]),
      }),
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membershipQuery.from })
        .mockReturnValueOnce({ from: requestQuery.from })
        .mockReturnValueOnce({ from: sourceQuery.from })
        .mockReturnValueOnce({ from: targetQuery.from })
        .mockReturnValueOnce({ from: itemQuery.from }),
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: insertRequestValues })
        .mockReturnValueOnce({ values: insertMovementValues })
        .mockReturnValueOnce({ values: insertLinesValues }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }
    const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient)
    )
    const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
    const config = {
      get: vi.fn((key: string) =>
        key === 'ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED'
          ? true
          : [PRINCIPAL.tenantId]
      ),
    } as unknown as ConfigService
    const database = { client: { transaction } } as unknown as DatabaseService
    const candidate = new InventoryStockMovementCreationService(
      config,
      database,
      audit as unknown as AuditService
    )

    await expect(
      candidate.create(COMMAND, PRINCIPAL, 'movement-create-1')
    ).resolves.toEqual({
      stockMovementId: created.id,
      tenantId: PRINCIPAL.tenantId,
      status: 'draft',
      lineCount: 1,
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(insertRequestValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: PRINCIPAL.tenantId,
        idempotency_key: 'movement-create-1',
        created_by: PRINCIPAL.userId,
      })
    )
    expect(insertMovementValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: PRINCIPAL.tenantId,
        movement_type: 'transfer',
        source_warehouse_id: source.id,
        target_warehouse_id: target.id,
        created_by: PRINCIPAL.userId,
      })
    )
    expect(insertLinesValues).toHaveBeenCalledWith([
      expect.objectContaining({
        stock_movement_id: created.id,
        material_item_id: item.id,
        quantity_micros: 1_250_000,
      }),
    ])
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'succeeded',
        stock_movement_id: created.id,
        result: {
          stockMovementId: created.id,
          tenantId: PRINCIPAL.tenantId,
          status: 'draft',
          lineCount: 1,
        },
      })
    )
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).toHaveBeenCalledWith(
      transactionClient,
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        entityType: 'stock_movement',
        entityId: created.id,
        action: 'create',
      })
    )
  })
})
