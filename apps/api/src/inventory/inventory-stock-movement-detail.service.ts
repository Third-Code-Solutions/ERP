import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  inventoryStockMovementDetailResultSchema,
  type InventoryStockMovementDetailResult,
} from '@third-code-erp/shared-types'
import { sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

const MAX_LINES = 200
const MAX_LEDGER_ENTRIES = 1_000

interface MovementRow {
  [key: string]: unknown
  id: string
  internal_number: string | null
  movement_type: string
  status: string
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

interface MovementLineRow {
  [key: string]: unknown
  id: string
  line_number: number | string | bigint
  item_code: string
  description: string
  uom_code: string
  cost_code: string | null
  quantity_micros: string | number | bigint
  declared_unit_cost_cents: string | number | bigint | null
  posted_unit_cost_cents: string | number | bigint | null
  posted_value_cents: string | number | bigint | null
}

interface LedgerRow {
  [key: string]: unknown
  id: string
  event_type: string
  occurred_on: string
  item_code: string
  warehouse_code: string
  quantity_delta_micros: string | number | bigint
  value_delta_cents: string | number | bigint
  reverses_stock_ledger_entry_id: string | null
}

@Injectable()
export class InventoryStockMovementDetailService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async read(
    movementId: string,
    principal: ErpPrincipal
  ): Promise<InventoryStockMovementDetailResult> {
    const [movement] = await this.database.client.execute<MovementRow>(sql`
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
        and movement.tenant_id = ${principal.tenantId}::uuid
      limit 1
    `)
    if (!movement) throw new NotFoundException('Stock Movement not found')

    const [lineRows, ledgerRows] = await Promise.all([
      this.database.client.execute<MovementLineRow>(sql`
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
          and line.tenant_id = ${principal.tenantId}::uuid
        order by line.line_number
        limit ${MAX_LINES + 1}
      `),
      this.database.client.execute<LedgerRow>(sql`
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
          and entry.tenant_id = ${principal.tenantId}::uuid
        order by entry.created_at, entry.id
        limit ${MAX_LEDGER_ENTRIES + 1}
      `),
    ])

    if (lineRows.length > MAX_LINES) {
      throw new BadRequestException(
        'Stock Movement detail exceeds the line display limit'
      )
    }
    if (ledgerRows.length > MAX_LEDGER_ENTRIES) {
      throw new BadRequestException(
        'Stock Movement detail exceeds the ledger display limit'
      )
    }

    return inventoryStockMovementDetailResultSchema.parse({
      tenantId: principal.tenantId,
      movement: {
        id: movement.id,
        internalNumber: movement.internal_number,
        movementType: movement.movement_type,
        status: movement.status,
        movementDate: movement.movement_date,
        currency: movement.currency,
        reason: movement.reason,
        sourceWarehouseCode: movement.source_code,
        sourceWarehouseName: movement.source_name,
        targetWarehouseCode: movement.target_code,
        targetWarehouseName: movement.target_name,
        projectName: movement.project_name,
        postingJournalEntryId: movement.posting_journal_entry_id,
        postingJournalNumber: movement.posting_journal_number,
        reversalJournalEntryId: movement.reversal_journal_entry_id,
        reversalJournalNumber: movement.reversal_journal_number,
        postedAt: movement.posted_at,
        reversedAt: movement.reversed_at,
        reversalReason: movement.reversal_reason,
      },
      lines: lineRows.map((line) => ({
        id: line.id,
        lineNumber: Number(line.line_number),
        itemCode: line.item_code,
        description: line.description,
        uomCode: line.uom_code,
        costCode: line.cost_code,
        quantityMicros: String(line.quantity_micros),
        declaredUnitCostCents:
          line.declared_unit_cost_cents === null
            ? null
            : String(line.declared_unit_cost_cents),
        postedUnitCostCents:
          line.posted_unit_cost_cents === null
            ? null
            : String(line.posted_unit_cost_cents),
        postedValueCents:
          line.posted_value_cents === null
            ? null
            : String(line.posted_value_cents),
      })),
      ledger: ledgerRows.map((entry) => ({
        id: entry.id,
        eventType: entry.event_type,
        occurredOn: entry.occurred_on,
        itemCode: entry.item_code,
        warehouseCode: entry.warehouse_code,
        quantityDeltaMicros: String(entry.quantity_delta_micros),
        valueDeltaCents: String(entry.value_delta_cents),
        reversesStockLedgerEntryId: entry.reverses_stock_ledger_entry_id,
      })),
    })
  }
}
