import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  char,
} from 'drizzle-orm/pg-core'
import {
  stockLedgerEventTypeEnum,
  stockReceiptStatusEnum,
} from './enums'
import { journalEntries } from './accounting'
import { materialItems } from './bom-extras'
import { deliverySchedules } from './deliveries'
import { unitsOfMeasure, warehouses } from './inventory-masters'
import {
  stockMovementLines,
  stockMovements,
} from './inventory-movements'
import { poLineItems } from './po-line-items'
import { purchaseOrders } from './purchase-orders'
import { tenants } from './tenants'
import { users } from './users'

export const stockReceipts = pgTable(
  'stock_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    warehouse_id: uuid('warehouse_id').notNull(),
    purchase_order_id: uuid('purchase_order_id').notNull(),
    delivery_schedule_id: uuid('delivery_schedule_id'),
    internal_number: varchar('internal_number', { length: 40 }),
    supplier_delivery_reference: varchar('supplier_delivery_reference', {
      length: 120,
    }),
    status: stockReceiptStatusEnum('status').notNull().default('draft'),
    received_date: date('received_date').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    notes: text('notes'),
    posting_journal_entry_id: uuid('posting_journal_entry_id'),
    posted_by: uuid('posted_by'),
    posted_at: timestamp('posted_at', { withTimezone: true }),
    reversal_journal_entry_id: uuid('reversal_journal_entry_id'),
    reversed_by: uuid('reversed_by'),
    reversed_at: timestamp('reversed_at', { withTimezone: true }),
    reversal_reason: text('reversal_reason'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_stock_receipts_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantNumberIdx: uniqueIndex('ux_stock_receipts_tenant_number')
      .on(table.tenant_id, table.internal_number)
      .where(sql`${table.internal_number} is not null`),
    tenantStatusDateIdx: index('idx_stock_receipts_tenant_status_date').on(
      table.tenant_id,
      table.status,
      table.received_date
    ),
    purchaseOrderIdx: index('idx_stock_receipts_purchase_order').on(
      table.tenant_id,
      table.purchase_order_id
    ),
    warehouseIdx: index('idx_stock_receipts_warehouse').on(
      table.tenant_id,
      table.warehouse_id
    ),
    warehouseTenantFk: foreignKey({
      name: 'stock_receipts_warehouse_tenant_fk',
      columns: [table.tenant_id, table.warehouse_id],
      foreignColumns: [warehouses.tenant_id, warehouses.id],
    }).onDelete('restrict'),
    purchaseOrderTenantFk: foreignKey({
      name: 'stock_receipts_purchase_order_tenant_fk',
      columns: [table.tenant_id, table.purchase_order_id],
      foreignColumns: [purchaseOrders.tenant_id, purchaseOrders.id],
    }).onDelete('restrict'),
    deliveryTenantFk: foreignKey({
      name: 'stock_receipts_delivery_tenant_fk',
      columns: [table.tenant_id, table.delivery_schedule_id],
      foreignColumns: [deliverySchedules.tenant_id, deliverySchedules.id],
    }).onDelete('restrict'),
    postingJournalTenantFk: foreignKey({
      name: 'stock_receipts_posting_journal_tenant_fk',
      columns: [table.tenant_id, table.posting_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    reversalJournalTenantFk: foreignKey({
      name: 'stock_receipts_reversal_journal_tenant_fk',
      columns: [table.tenant_id, table.reversal_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'stock_receipts_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    postedByTenantFk: foreignKey({
      name: 'stock_receipts_posted_by_tenant_fk',
      columns: [table.tenant_id, table.posted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    reversedByTenantFk: foreignKey({
      name: 'stock_receipts_reversed_by_tenant_fk',
      columns: [table.tenant_id, table.reversed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  })
)

export const stockReceiptLines = pgTable(
  'stock_receipt_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    stock_receipt_id: uuid('stock_receipt_id').notNull(),
    po_line_item_id: uuid('po_line_item_id').notNull(),
    material_item_id: uuid('material_item_id').notNull(),
    uom_id: uuid('uom_id').notNull(),
    line_number: integer('line_number').notNull(),
    description: text('description').notNull(),
    quantity_micros: bigint('quantity_micros', { mode: 'number' }).notNull(),
    unit_cost_cents: bigint('unit_cost_cents', { mode: 'number' }).notNull(),
    line_total_cents: bigint('line_total_cents', { mode: 'number' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_stock_receipt_lines_tenant_id_id'
    ).on(table.tenant_id, table.id),
    receiptLineIdx: uniqueIndex('ux_stock_receipt_lines_receipt_line').on(
      table.stock_receipt_id,
      table.line_number
    ),
    receiptPoLineIdx: uniqueIndex(
      'ux_stock_receipt_lines_receipt_po_line'
    ).on(table.stock_receipt_id, table.po_line_item_id),
    poLineIdx: index('idx_stock_receipt_lines_po_line').on(
      table.tenant_id,
      table.po_line_item_id
    ),
    receiptTenantFk: foreignKey({
      name: 'stock_receipt_lines_receipt_tenant_fk',
      columns: [table.tenant_id, table.stock_receipt_id],
      foreignColumns: [stockReceipts.tenant_id, stockReceipts.id],
    }).onDelete('cascade'),
    poLineTenantFk: foreignKey({
      name: 'stock_receipt_lines_po_line_tenant_fk',
      columns: [table.tenant_id, table.po_line_item_id],
      foreignColumns: [poLineItems.tenant_id, poLineItems.id],
    }).onDelete('restrict'),
    materialTenantFk: foreignKey({
      name: 'stock_receipt_lines_material_tenant_fk',
      columns: [table.tenant_id, table.material_item_id],
      foreignColumns: [materialItems.tenant_id, materialItems.id],
    }).onDelete('restrict'),
    uomTenantFk: foreignKey({
      name: 'stock_receipt_lines_uom_tenant_fk',
      columns: [table.tenant_id, table.uom_id],
      foreignColumns: [unitsOfMeasure.tenant_id, unitsOfMeasure.id],
    }).onDelete('restrict'),
    lineNumberCheck: check(
      'stock_receipt_lines_number_positive',
      sql`${table.line_number} > 0`
    ),
    quantityCheck: check(
      'stock_receipt_lines_quantity_positive',
      sql`${table.quantity_micros} > 0`
    ),
    unitCostCheck: check(
      'stock_receipt_lines_unit_cost_nonnegative',
      sql`${table.unit_cost_cents} >= 0`
    ),
    totalCheck: check(
      'stock_receipt_lines_total_positive',
      sql`${table.line_total_cents} > 0`
    ),
  })
)

export const stockLedgerEntries = pgTable(
  'stock_ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    event_type: stockLedgerEventTypeEnum('event_type').notNull(),
    stock_receipt_id: uuid('stock_receipt_id'),
    stock_receipt_line_id: uuid('stock_receipt_line_id'),
    stock_movement_id: uuid('stock_movement_id'),
    stock_movement_line_id: uuid('stock_movement_line_id'),
    reverses_stock_ledger_entry_id: uuid(
      'reverses_stock_ledger_entry_id'
    ),
    warehouse_id: uuid('warehouse_id').notNull(),
    material_item_id: uuid('material_item_id').notNull(),
    uom_id: uuid('uom_id').notNull(),
    occurred_on: date('occurred_on').notNull(),
    quantity_delta_micros: bigint('quantity_delta_micros', {
      mode: 'number',
    }).notNull(),
    value_delta_cents: bigint('value_delta_cents', {
      mode: 'number',
    }).notNull(),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_stock_ledger_entries_tenant_id_id'
    ).on(table.tenant_id, table.id),
    receiptLineEventIdx: uniqueIndex(
      'ux_stock_ledger_receipt_line_event'
    ).on(
      table.tenant_id,
      table.stock_receipt_line_id,
      table.event_type
    ),
    balanceIdx: index('idx_stock_ledger_balance').on(
      table.tenant_id,
      table.warehouse_id,
      table.material_item_id,
      table.occurred_on,
      table.id
    ),
    receiptIdx: index('idx_stock_ledger_receipt').on(
      table.tenant_id,
      table.stock_receipt_id
    ),
    movementLineEventWarehouseIdx: uniqueIndex(
      'ux_stock_ledger_movement_line_event_warehouse'
    )
      .on(
        table.tenant_id,
        table.stock_movement_line_id,
        table.event_type,
        table.warehouse_id
      )
      .where(sql`${table.stock_movement_line_id} is not null`),
    movementReversalIdx: uniqueIndex(
      'ux_stock_ledger_movement_reversal'
    )
      .on(table.tenant_id, table.reverses_stock_ledger_entry_id)
      .where(sql`${table.reverses_stock_ledger_entry_id} is not null`),
    movementIdx: index('idx_stock_ledger_movement')
      .on(table.tenant_id, table.stock_movement_id)
      .where(sql`${table.stock_movement_id} is not null`),
    receiptTenantFk: foreignKey({
      name: 'stock_ledger_entries_receipt_tenant_fk',
      columns: [table.tenant_id, table.stock_receipt_id],
      foreignColumns: [stockReceipts.tenant_id, stockReceipts.id],
    }).onDelete('restrict'),
    receiptLineTenantFk: foreignKey({
      name: 'stock_ledger_entries_receipt_line_tenant_fk',
      columns: [table.tenant_id, table.stock_receipt_line_id],
      foreignColumns: [stockReceiptLines.tenant_id, stockReceiptLines.id],
    }).onDelete('restrict'),
    movementTenantFk: foreignKey({
      name: 'stock_ledger_entries_movement_tenant_fk',
      columns: [table.tenant_id, table.stock_movement_id],
      foreignColumns: [stockMovements.tenant_id, stockMovements.id],
    }).onDelete('restrict'),
    movementLineTenantFk: foreignKey({
      name: 'stock_ledger_entries_movement_line_tenant_fk',
      columns: [table.tenant_id, table.stock_movement_line_id],
      foreignColumns: [
        stockMovementLines.tenant_id,
        stockMovementLines.id,
      ],
    }).onDelete('restrict'),
    reversalTenantFk: foreignKey({
      name: 'stock_ledger_entries_reversal_tenant_fk',
      columns: [table.tenant_id, table.reverses_stock_ledger_entry_id],
      foreignColumns: [table.tenant_id, table.id],
    }).onDelete('restrict'),
    warehouseTenantFk: foreignKey({
      name: 'stock_ledger_entries_warehouse_tenant_fk',
      columns: [table.tenant_id, table.warehouse_id],
      foreignColumns: [warehouses.tenant_id, warehouses.id],
    }).onDelete('restrict'),
    materialTenantFk: foreignKey({
      name: 'stock_ledger_entries_material_tenant_fk',
      columns: [table.tenant_id, table.material_item_id],
      foreignColumns: [materialItems.tenant_id, materialItems.id],
    }).onDelete('restrict'),
    uomTenantFk: foreignKey({
      name: 'stock_ledger_entries_uom_tenant_fk',
      columns: [table.tenant_id, table.uom_id],
      foreignColumns: [unitsOfMeasure.tenant_id, unitsOfMeasure.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'stock_ledger_entries_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    signedValuesCheck: check(
      'stock_ledger_entries_signed_values',
      sql`${table.quantity_delta_micros} <> 0
        and ${table.value_delta_cents} <> 0
        and (
          (${table.quantity_delta_micros} > 0 and ${table.value_delta_cents} > 0)
          or
          (${table.quantity_delta_micros} < 0 and ${table.value_delta_cents} < 0)
        )`
    ),
    singleSourceCheck: check(
      'stock_ledger_entries_single_source',
      sql`(
        (
          ${table.stock_receipt_id} is not null
          and ${table.stock_receipt_line_id} is not null
          and ${table.stock_movement_id} is null
          and ${table.stock_movement_line_id} is null
          and ${table.reverses_stock_ledger_entry_id} is null
        )
        or
        (
          ${table.stock_receipt_id} is null
          and ${table.stock_receipt_line_id} is null
          and ${table.stock_movement_id} is not null
          and ${table.stock_movement_line_id} is not null
        )
      )`
    ),
  })
)

export type StockReceipt = typeof stockReceipts.$inferSelect
export type StockReceiptInsert = typeof stockReceipts.$inferInsert
export type StockReceiptLine = typeof stockReceiptLines.$inferSelect
export type StockReceiptLineInsert = typeof stockReceiptLines.$inferInsert
export type StockLedgerEntry = typeof stockLedgerEntries.$inferSelect
