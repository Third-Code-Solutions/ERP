import { NotFoundException } from '@nestjs/common'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { InventoryStockMovementDetailService } from './inventory-stock-movement-detail.service'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const MOVEMENT_ID = '88888888-8888-4888-8888-888888888888'
const LINE_ID = '99999999-9999-4999-8999-999999999999'
const LEDGER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: TENANT_ID,
  role: 'procurement',
  email: 'procurement@example.test',
}

function harness() {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([
      {
        id: MOVEMENT_ID,
        internal_number: 'SM-2026-000001',
        movement_type: 'transfer',
        status: 'posted',
        movement_date: '2026-08-05',
        currency: 'PHP',
        reason: 'Move accepted materials',
        source_code: 'MAIN',
        source_name: 'Main store',
        target_code: 'SITE-A',
        target_name: 'Site A',
        project_name: 'Site A project',
        posting_journal_entry_id: '11111111-1111-4111-8111-111111111111',
        posting_journal_number: 'JE-0001',
        reversal_journal_entry_id: null,
        reversal_journal_number: null,
        posted_at: '2026-08-05T00:00:00.000Z',
        reversed_at: null,
        reversal_reason: null,
      },
    ])
    .mockResolvedValueOnce([
      {
        id: LINE_ID,
        line_number: 1,
        item_code: 'CEMENT',
        description: 'Cement',
        uom_code: 'BAG',
        cost_code: 'MAT-001',
        quantity_micros: '4250000',
        declared_unit_cost_cents: '12500',
        posted_unit_cost_cents: '12500',
        posted_value_cents: '53125',
      },
    ])
    .mockResolvedValueOnce([
      {
        id: LEDGER_ID,
        event_type: 'transfer_out',
        occurred_on: '2026-08-05',
        item_code: 'CEMENT',
        warehouse_code: 'MAIN',
        quantity_delta_micros: '-4250000',
        value_delta_cents: '-53125',
        reverses_stock_ledger_entry_id: null,
      },
    ])
  const service = new InventoryStockMovementDetailService({
    client: { execute },
  } as unknown as DatabaseService)
  return { service, execute }
}

describe('InventoryStockMovementDetailService', () => {
  it('returns exact, tenant-scoped movement evidence', async () => {
    const probe = harness()

    await expect(probe.service.read(MOVEMENT_ID, PRINCIPAL)).resolves.toEqual({
      tenantId: TENANT_ID,
      movement: {
        id: MOVEMENT_ID,
        internalNumber: 'SM-2026-000001',
        movementType: 'transfer',
        status: 'posted',
        movementDate: '2026-08-05',
        currency: 'PHP',
        reason: 'Move accepted materials',
        sourceWarehouseCode: 'MAIN',
        sourceWarehouseName: 'Main store',
        targetWarehouseCode: 'SITE-A',
        targetWarehouseName: 'Site A',
        projectName: 'Site A project',
        postingJournalEntryId: '11111111-1111-4111-8111-111111111111',
        postingJournalNumber: 'JE-0001',
        reversalJournalEntryId: null,
        reversalJournalNumber: null,
        postedAt: '2026-08-05T00:00:00.000Z',
        reversedAt: null,
        reversalReason: null,
      },
      lines: [
        {
          id: LINE_ID,
          lineNumber: 1,
          itemCode: 'CEMENT',
          description: 'Cement',
          uomCode: 'BAG',
          costCode: 'MAT-001',
          quantityMicros: '4250000',
          declaredUnitCostCents: '12500',
          postedUnitCostCents: '12500',
          postedValueCents: '53125',
        },
      ],
      ledger: [
        {
          id: LEDGER_ID,
          eventType: 'transfer_out',
          occurredOn: '2026-08-05',
          itemCode: 'CEMENT',
          warehouseCode: 'MAIN',
          quantityDeltaMicros: '-4250000',
          valueDeltaCents: '-53125',
          reversesStockLedgerEntryId: null,
        },
      ],
    })

    expect(probe.execute).toHaveBeenCalledTimes(3)
    const dialect = new PgDialect()
    for (const [query] of probe.execute.mock.calls) {
      const compiled = dialect.sqlToQuery(query)
      expect(compiled.params).toContain(TENANT_ID)
      expect(compiled.params).toContain(MOVEMENT_ID)
    }
  })

  it('returns not found without reading child evidence', async () => {
    const execute = vi.fn().mockResolvedValueOnce([])
    const service = new InventoryStockMovementDetailService({
      client: { execute },
    } as unknown as DatabaseService)

    await expect(service.read(MOVEMENT_ID, PRINCIPAL)).rejects.toBeInstanceOf(
      NotFoundException
    )
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
