import 'reflect-metadata'

import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type {
  StockMovementPostCommand,
  StockMovementReverseCommand,
} from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { InventoryStockMovementWorkflowService } from './inventory-stock-movement-workflow.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}
const MOVEMENT_ID = '33333333-3333-4333-8333-333333333333'
const POST_COMMAND: StockMovementPostCommand = {}
const REVERSE_COMMAND: StockMovementReverseCommand = {
  reason: 'Supplier correction',
  reversalDate: '2026-08-05',
}

function selectQuery(rows: unknown[]) {
  const rowLock = vi.fn().mockResolvedValue(rows)
  const limit = vi.fn().mockReturnValue({ for: rowLock })
  const where = vi.fn().mockReturnValue({ limit, for: rowLock })
  const from = vi.fn().mockReturnValue({ where })
  return { from, where, limit, rowLock }
}

function disabledService(
  enabled = false,
  tenantIds: string[] = []
) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    candidate: new InventoryStockMovementWorkflowService(
      config,
      database,
      {} as AuditService
    ),
    transaction,
  }
}

describe('InventoryStockMovementWorkflowService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const { candidate, transaction } = disabledService()

    await expect(
      candidate.post(MOVEMENT_ID, POST_COMMAND, PRINCIPAL, 'movement-post-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(
      candidate.reverse(
        MOVEMENT_ID,
        REVERSE_COMMAND,
        PRINCIPAL,
        'movement-reverse-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when the tenant is absent from the allowlist', async () => {
    const { candidate, transaction } = disabledService(true, [])

    await expect(
      candidate.post(MOVEMENT_ID, POST_COMMAND, PRINCIPAL, 'movement-post-2')
    ).rejects.toThrow(
      'Stock Movement workflow is not enabled for this tenant; no Stock Movement was changed.'
    )
    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects invalid retry keys before opening a transaction', async () => {
    const { candidate, transaction } = disabledService(true, [PRINCIPAL.tenantId])

    await expect(
      candidate.post(MOVEMENT_ID, POST_COMMAND, PRINCIPAL, '   ')
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('posts through the database function and completes the tenant idempotency ledger atomically', async () => {
    const membership = {
      tenantId: PRINCIPAL.tenantId,
      role: PRINCIPAL.role,
      email: PRINCIPAL.email,
    }
    const movement = { id: MOVEMENT_ID }
    const request = {
      id: '44444444-4444-4444-8444-444444444444',
      action: 'post',
      stockMovementId: MOVEMENT_ID,
      requestHash: '',
      state: 'processing',
      result: null,
    }
    const completed = { id: request.id }
    const membershipQuery = selectQuery([membership])
    const movementQuery = selectQuery([movement])
    const requestQuery = selectQuery([request])
    const insertRequestValues = vi.fn().mockImplementation((values) => {
      request.requestHash = values.request_hash
      return { onConflictDoNothing: vi.fn().mockReturnValue(undefined) }
    })
    const updateSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([completed]),
      }),
    })
    const transactionClient = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: membershipQuery.from })
        .mockReturnValueOnce({ from: movementQuery.from })
        .mockReturnValueOnce({ from: requestQuery.from }),
      insert: vi.fn().mockReturnValue({ values: insertRequestValues }),
      execute: vi.fn().mockResolvedValue([
        {
          stock_movement_id: MOVEMENT_ID,
          movement_number: 'SM-2026-000001',
          journal_entry_id: null,
          journal_entry_number: null,
        },
      ]),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    }
    const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient)
    )
    const audit = { stampActor: vi.fn(), writeSemantic: vi.fn() }
    const config = {
      get: vi.fn((key: string) =>
        key === 'ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED'
          ? true
          : [PRINCIPAL.tenantId]
      ),
    } as unknown as ConfigService
    const database = { client: { transaction } } as unknown as DatabaseService
    const candidate = new InventoryStockMovementWorkflowService(
      config,
      database,
      audit as unknown as AuditService
    )

    await expect(
      candidate.post(MOVEMENT_ID, POST_COMMAND, PRINCIPAL, 'movement-post-1')
    ).resolves.toEqual({
      stockMovementId: MOVEMENT_ID,
      tenantId: PRINCIPAL.tenantId,
      status: 'posted',
      movementNumber: 'SM-2026-000001',
      journalEntryId: null,
      journalEntryNumber: null,
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(insertRequestValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: PRINCIPAL.tenantId,
        stock_movement_id: MOVEMENT_ID,
        action: 'post',
        idempotency_key: 'movement-post-1',
        created_by: PRINCIPAL.userId,
      })
    )
    expect(transactionClient.execute).toHaveBeenCalledOnce()
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'succeeded',
        result: {
          stockMovementId: MOVEMENT_ID,
          tenantId: PRINCIPAL.tenantId,
          status: 'posted',
          movementNumber: 'SM-2026-000001',
          journalEntryId: null,
          journalEntryNumber: null,
        },
      })
    )
    expect(audit.stampActor).toHaveBeenCalledOnce()
    expect(audit.writeSemantic).toHaveBeenCalledWith(
      transactionClient,
      expect.objectContaining({
        tenantId: PRINCIPAL.tenantId,
        entityType: 'stock_movement',
        entityId: MOVEMENT_ID,
        action: 'status_change',
      })
    )
  })
})
