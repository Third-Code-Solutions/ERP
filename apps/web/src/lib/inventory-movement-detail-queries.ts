import { db } from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import type { InventoryStockMovementDetailResult } from '@third-code-erp/shared-types'
import {
  getInventoryStockMovementDetailThroughCoreApi,
  inventoryStockMovementDetailReadsUseCoreApi,
} from './erp-core-client'

const MAX_LINES = 200
const MAX_LEDGER_ENTRIES = 1_000

export interface InventoryMovementDetailPageData {
  movement: {
    id: string
    internal_number: string | null
    movement_type: 'transfer' | 'consumption' | 'adjustment'
    status: 'draft' | 'posted' | 'reversed'
    movement_date: string
    currency: string
    reason: string
    source_code: string
    source_name: string
    target_code: string | null
    target_name: string | null
    project_name: string | null
    posting_journal_entry_id: string | null
    posting_journal_number: string | null
    reversal_journal_entry_id: string | null
    reversal_journal_number: string | null
    posted_at: string | null
    reversed_at: string | null
    reversal_reason: string | null
  }
  lines: Array<{
    id: string
    line_number: number
    item_code: string
    description: string
    uom_code: string
    cost_code: string | null
    quantity_micros: number
    declared_unit_cost_cents: number | null
    posted_unit_cost_cents: number | null
    posted_value_cents: number | null
  }>
  ledger: Array<{
    id: string
    event_type: string
    occurred_on: string
    item_code: string
    warehouse_code: string
    quantity_delta_micros: number
    value_delta_cents: number
    reverses_stock_ledger_entry_id: string | null
  }>
}

function safeInteger(value: string | number | bigint, label: string): number {
  let exact: bigint
  try {
    exact = typeof value === 'bigint' ? value : BigInt(String(value))
  } catch {
    throw new Error(`Stock Movement ${label} is not an integer`)
  }
  const result = Number(exact)
  if (!Number.isSafeInteger(result)) {
    throw new Error(`Stock Movement ${label} exceeds the safe display range`)
  }
  return result
}

function mapCoreResult(
  tenantId: string,
  movementId: string,
  result: InventoryStockMovementDetailResult
): InventoryMovementDetailPageData {
  if (result.tenantId.toLowerCase() !== tenantId.toLowerCase()) {
    throw new Error('Stock Movement detail returned an invalid tenant scope')
  }
  if (result.movement.id.toLowerCase() !== movementId.toLowerCase()) {
    throw new Error('Stock Movement detail returned an invalid movement')
  }
  if (
    result.lines.length > MAX_LINES ||
    result.ledger.length > MAX_LEDGER_ENTRIES
  ) {
    throw new Error('Stock Movement detail exceeds the display limit')
  }
  return {
    movement: {
      id: result.movement.id,
      internal_number: result.movement.internalNumber,
      movement_type: result.movement.movementType,
      status: result.movement.status,
      movement_date: result.movement.movementDate,
      currency: result.movement.currency,
      reason: result.movement.reason,
      source_code: result.movement.sourceWarehouseCode,
      source_name: result.movement.sourceWarehouseName,
      target_code: result.movement.targetWarehouseCode,
      target_name: result.movement.targetWarehouseName,
      project_name: result.movement.projectName,
      posting_journal_entry_id: result.movement.postingJournalEntryId,
      posting_journal_number: result.movement.postingJournalNumber,
      reversal_journal_entry_id: result.movement.reversalJournalEntryId,
      reversal_journal_number: result.movement.reversalJournalNumber,
      posted_at: result.movement.postedAt,
      reversed_at: result.movement.reversedAt,
      reversal_reason: result.movement.reversalReason,
    },
    lines: result.lines.map((line) => ({
      id: line.id,
      line_number: line.lineNumber,
      item_code: line.itemCode,
      description: line.description,
      uom_code: line.uomCode,
      cost_code: line.costCode,
      quantity_micros: safeInteger(line.quantityMicros, 'quantity'),
      declared_unit_cost_cents:
        line.declaredUnitCostCents === null
          ? null
          : safeInteger(line.declaredUnitCostCents, 'declared unit cost'),
      posted_unit_cost_cents:
        line.postedUnitCostCents === null
          ? null
          : safeInteger(line.postedUnitCostCents, 'posted unit cost'),
      posted_value_cents:
        line.postedValueCents === null
          ? null
          : safeInteger(line.postedValueCents, 'posted value'),
    })),
    ledger: result.ledger.map((entry) => ({
      id: entry.id,
      event_type: entry.eventType,
      occurred_on: entry.occurredOn,
      item_code: entry.itemCode,
      warehouse_code: entry.warehouseCode,
      quantity_delta_micros: safeInteger(
        entry.quantityDeltaMicros,
        'ledger quantity'
      ),
      value_delta_cents: safeInteger(entry.valueDeltaCents, 'ledger value'),
      reverses_stock_ledger_entry_id: entry.reversesStockLedgerEntryId,
    })),
  }
}

async function readLegacyMovementDetail(
  tenantId: string,
  movementId: string
): Promise<InventoryMovementDetailPageData | null> {
  const [movementRows, rawLines, rawLedger] = await Promise.all([
    db.execute<InventoryMovementDetailPageData['movement']>(sql`
      select
        movement.id,
        movement.internal_number,
        movement.movement_type::text,
        movement.status::text,
        movement.movement_date::text,
        movement.currency::text,
        movement.reason,
        movement.posting_journal_entry_id,
        posted_journal.entry_number as posting_journal_number,
        movement.reversal_journal_entry_id,
        reversal_journal.entry_number as reversal_journal_number,
        to_char(
          movement.posted_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) as posted_at,
        to_char(
          movement.reversed_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) as reversed_at,
        movement.reversal_reason,
        source.code as source_code,
        source.name as source_name,
        target.code as target_code,
        target.name as target_name,
        project.name as project_name
      from public.stock_movements movement
      join public.warehouses source
        on source.id = movement.source_warehouse_id
       and source.tenant_id = movement.tenant_id
      left join public.warehouses target
        on target.id = movement.target_warehouse_id
       and target.tenant_id = movement.tenant_id
      left join public.projects project
        on project.id = movement.project_id
       and project.tenant_id = movement.tenant_id
      left join public.journal_entries posted_journal
        on posted_journal.id = movement.posting_journal_entry_id
       and posted_journal.tenant_id = movement.tenant_id
      left join public.journal_entries reversal_journal
        on reversal_journal.id = movement.reversal_journal_entry_id
       and reversal_journal.tenant_id = movement.tenant_id
      where movement.id = ${movementId}::uuid
        and movement.tenant_id = ${tenantId}::uuid
      limit 1
    `),
    db.execute<{
      [key: string]: unknown
      id: string
      line_number: string | number | bigint
      item_code: string
      description: string
      uom_code: string
      cost_code: string | null
      quantity_micros: string | number | bigint
      declared_unit_cost_cents: string | number | bigint | null
      posted_unit_cost_cents: string | number | bigint | null
      posted_value_cents: string | number | bigint | null
    }>(sql`
      select
        line.id,
        line.line_number,
        item.code as item_code,
        line.description,
        uom.code as uom_code,
        cost_code.code as cost_code,
        line.quantity_micros::text,
        line.declared_unit_cost_cents::text,
        line.posted_unit_cost_cents::text,
        line.posted_value_cents::text
      from public.stock_movement_lines line
      join public.material_items item
        on item.id = line.material_item_id
       and item.tenant_id = line.tenant_id
      join public.units_of_measure uom
        on uom.id = line.uom_id
       and uom.tenant_id = line.tenant_id
      left join public.cost_codes cost_code
        on cost_code.id = line.cost_code_id
       and cost_code.tenant_id = line.tenant_id
      where line.stock_movement_id = ${movementId}::uuid
        and line.tenant_id = ${tenantId}::uuid
      order by line.line_number
      limit ${MAX_LINES + 1}
    `),
    db.execute<{
      [key: string]: unknown
      id: string
      event_type: string
      occurred_on: string
      item_code: string
      warehouse_code: string
      quantity_delta_micros: string | number | bigint
      value_delta_cents: string | number | bigint
      reverses_stock_ledger_entry_id: string | null
    }>(sql`
      select
        entry.id,
        entry.event_type::text,
        entry.occurred_on::text,
        item.code as item_code,
        warehouse.code as warehouse_code,
        entry.quantity_delta_micros::text,
        entry.value_delta_cents::text,
        entry.reverses_stock_ledger_entry_id
      from public.stock_ledger_entries entry
      join public.material_items item
        on item.id = entry.material_item_id
       and item.tenant_id = entry.tenant_id
      join public.warehouses warehouse
        on warehouse.id = entry.warehouse_id
       and warehouse.tenant_id = entry.tenant_id
      where entry.stock_movement_id = ${movementId}::uuid
        and entry.tenant_id = ${tenantId}::uuid
      order by entry.created_at, entry.id
      limit ${MAX_LEDGER_ENTRIES + 1}
    `),
  ])
  const movement = movementRows[0]
  if (!movement) return null
  if (rawLines.length > MAX_LINES || rawLedger.length > MAX_LEDGER_ENTRIES) {
    throw new Error('Stock Movement detail exceeds the display limit')
  }
  return {
    movement,
    lines: rawLines.map((line) => ({
      id: line.id,
      line_number: safeInteger(line.line_number, 'line number'),
      item_code: line.item_code,
      description: line.description,
      uom_code: line.uom_code,
      cost_code: line.cost_code,
      quantity_micros: safeInteger(line.quantity_micros, 'quantity'),
      declared_unit_cost_cents:
        line.declared_unit_cost_cents === null
          ? null
          : safeInteger(line.declared_unit_cost_cents, 'declared unit cost'),
      posted_unit_cost_cents:
        line.posted_unit_cost_cents === null
          ? null
          : safeInteger(line.posted_unit_cost_cents, 'posted unit cost'),
      posted_value_cents:
        line.posted_value_cents === null
          ? null
          : safeInteger(line.posted_value_cents, 'posted value'),
    })),
    ledger: rawLedger.map((entry) => ({
      id: entry.id,
      event_type: entry.event_type,
      occurred_on: entry.occurred_on,
      item_code: entry.item_code,
      warehouse_code: entry.warehouse_code,
      quantity_delta_micros: safeInteger(
        entry.quantity_delta_micros,
        'ledger quantity'
      ),
      value_delta_cents: safeInteger(entry.value_delta_cents, 'ledger value'),
      reverses_stock_ledger_entry_id: entry.reverses_stock_ledger_entry_id,
    })),
  }
}

export async function getStockMovementDetail(
  tenantId: string,
  movementId: string
): Promise<InventoryMovementDetailPageData | null> {
  if (inventoryStockMovementDetailReadsUseCoreApi(tenantId)) {
    const result = await getInventoryStockMovementDetailThroughCoreApi(
      movementId
    )
    if (!result.ok) {
      if (result.status === 404) return null
      throw new Error(result.error ?? 'Stock Movement detail was not read')
    }
    if (!result.data) throw new Error('Stock Movement detail was not read')
    return mapCoreResult(tenantId, movementId, result.data)
  }
  return readLegacyMovementDetail(tenantId, movementId)
}
