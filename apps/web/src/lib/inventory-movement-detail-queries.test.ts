import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  flag: vi.fn(),
  core: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { execute: mocks.execute },
}))
vi.mock('./erp-core-client', () => ({
  inventoryStockMovementDetailReadsUseCoreApi: mocks.flag,
  getInventoryStockMovementDetailThroughCoreApi: mocks.core,
}))

import { getStockMovementDetail } from './inventory-movement-detail-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const MOVEMENT_ID = '88888888-8888-4888-8888-888888888888'

const HEADER = {
  id: MOVEMENT_ID,
  internal_number: 'SM-2026-000001',
  movement_type: 'transfer' as const,
  status: 'posted' as const,
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
}

const LINE = {
  id: '99999999-9999-4999-8999-999999999999',
  line_number: 1,
  item_code: 'CEMENT',
  description: 'Cement',
  uom_code: 'BAG',
  cost_code: 'MAT-001',
  quantity_micros: '4250000',
  declared_unit_cost_cents: '12500',
  posted_unit_cost_cents: '12500',
  posted_value_cents: '53125',
}

const LEDGER = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  event_type: 'transfer_out',
  occurred_on: '2026-08-05',
  item_code: 'CEMENT',
  warehouse_code: 'MAIN',
  quantity_delta_micros: '-4250000',
  value_delta_cents: '-53125',
  reverses_stock_ledger_entry_id: null,
}

const CORE_RESULT = {
  tenantId: TENANT_ID,
  movement: {
    id: MOVEMENT_ID,
    internalNumber: HEADER.internal_number,
    movementType: HEADER.movement_type,
    status: HEADER.status,
    movementDate: HEADER.movement_date,
    currency: HEADER.currency,
    reason: HEADER.reason,
    sourceWarehouseCode: HEADER.source_code,
    sourceWarehouseName: HEADER.source_name,
    targetWarehouseCode: HEADER.target_code,
    targetWarehouseName: HEADER.target_name,
    projectName: HEADER.project_name,
    postingJournalEntryId: HEADER.posting_journal_entry_id,
    postingJournalNumber: HEADER.posting_journal_number,
    reversalJournalEntryId: HEADER.reversal_journal_entry_id,
    reversalJournalNumber: HEADER.reversal_journal_number,
    postedAt: HEADER.posted_at,
    reversedAt: HEADER.reversed_at,
    reversalReason: HEADER.reversal_reason,
  },
  lines: [
    {
      id: LINE.id,
      lineNumber: 1,
      itemCode: LINE.item_code,
      description: LINE.description,
      uomCode: LINE.uom_code,
      costCode: LINE.cost_code,
      quantityMicros: LINE.quantity_micros,
      declaredUnitCostCents: LINE.declared_unit_cost_cents,
      postedUnitCostCents: LINE.posted_unit_cost_cents,
      postedValueCents: LINE.posted_value_cents,
    },
  ],
  ledger: [
    {
      id: LEDGER.id,
      eventType: LEDGER.event_type,
      occurredOn: LEDGER.occurred_on,
      itemCode: LEDGER.item_code,
      warehouseCode: LEDGER.warehouse_code,
      quantityDeltaMicros: LEDGER.quantity_delta_micros,
      valueDeltaCents: LEDGER.value_delta_cents,
      reversesStockLedgerEntryId: null,
    },
  ],
}

describe('Stock Movement detail query seam', () => {
  beforeEach(() => {
    mocks.execute.mockReset()
    mocks.flag.mockReset()
    mocks.core.mockReset()
  })

  it('keeps the legacy detail read tenant-scoped while the gate is closed', async () => {
    mocks.flag.mockReturnValue(false)
    mocks.execute
      .mockResolvedValueOnce([HEADER])
      .mockResolvedValueOnce([LINE])
      .mockResolvedValueOnce([LEDGER])

    await expect(getStockMovementDetail(TENANT_ID, MOVEMENT_ID)).resolves.toEqual(
      {
        movement: HEADER,
        lines: [
          {
            id: LINE.id,
            line_number: 1,
            item_code: LINE.item_code,
            description: LINE.description,
            uom_code: LINE.uom_code,
            cost_code: LINE.cost_code,
            quantity_micros: 4_250_000,
            declared_unit_cost_cents: 12_500,
            posted_unit_cost_cents: 12_500,
            posted_value_cents: 53_125,
          },
        ],
        ledger: [
          {
            id: LEDGER.id,
            event_type: LEDGER.event_type,
            occurred_on: LEDGER.occurred_on,
            item_code: LEDGER.item_code,
            warehouse_code: LEDGER.warehouse_code,
            quantity_delta_micros: -4_250_000,
            value_delta_cents: -53_125,
            reverses_stock_ledger_entry_id: null,
          },
        ],
      }
    )

    expect(mocks.execute).toHaveBeenCalledTimes(3)
    const dialect = new PgDialect()
    for (const [query] of mocks.execute.mock.calls) {
      const compiled = dialect.sqlToQuery(query)
      expect(compiled.params).toContain(TENANT_ID)
      expect(compiled.params).toContain(MOVEMENT_ID)
    }
  })

  it('maps exact Core detail output only when the gate is enabled', async () => {
    mocks.flag.mockReturnValue(true)
    mocks.core.mockResolvedValue({ ok: true, data: CORE_RESULT })

    await expect(getStockMovementDetail(TENANT_ID, MOVEMENT_ID)).resolves.toEqual(
      {
        movement: HEADER,
        lines: [
          expect.objectContaining({
            id: LINE.id,
            quantity_micros: 4_250_000,
            posted_value_cents: 53_125,
          }),
        ],
        ledger: [
          expect.objectContaining({
            id: LEDGER.id,
            quantity_delta_micros: -4_250_000,
            value_delta_cents: -53_125,
          }),
        ],
      }
    )
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.core).toHaveBeenCalledWith(MOVEMENT_ID)
  })

  it('preserves not-found behavior for a Core 404', async () => {
    mocks.flag.mockReturnValue(true)
    mocks.core.mockResolvedValue({
      ok: false,
      status: 404,
      error: 'Stock Movement was not found.',
    })

    await expect(getStockMovementDetail(TENANT_ID, MOVEMENT_ID)).resolves.toBe(
      null
    )
  })
})
