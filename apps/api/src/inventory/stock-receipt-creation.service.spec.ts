import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { CreateStockReceiptCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { StockReceiptCreationService } from './stock-receipt-creation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}

const COMMAND: CreateStockReceiptCommand = {
  warehouseId: '33333333-3333-4333-8333-333333333333',
  purchaseOrderId: '44444444-4444-4444-8444-444444444444',
  deliveryScheduleId: null,
  supplierDeliveryReference: null,
  receivedDate: '2026-08-01',
  notes: null,
  lines: [
    {
      poLineItemId: '55555555-5555-4555-8555-555555555555',
      quantity: '1',
    },
  ],
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const database = {
    client: { transaction: vi.fn() },
  } as unknown as DatabaseService
  return new StockReceiptCreationService(
    config,
    database,
    {} as AuditService
  )
}

describe('StockReceiptCreationService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const candidate = service()
    const transaction = vi.spyOn(
      (candidate as unknown as { database: DatabaseService }).database.client,
      'transaction'
    )

    await expect(
      candidate.create(COMMAND, PRINCIPAL, 'receipt-create-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    await expect(
      service(true).create(COMMAND, PRINCIPAL, 'receipt-create-1')
    ).rejects.toThrow(
      'Stock Receipt command is not enabled for this tenant; no Stock Receipt was created.'
    )
  })
})
