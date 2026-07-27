import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
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
} from 'drizzle-orm/pg-core'
import {
  stockMovementStatusEnum,
  stockMovementTypeEnum,
} from './enums'
import { journalEntries } from './accounting'
import { materialItems } from './bom-extras'
import { costCodes } from './budgets'
import { unitsOfMeasure, warehouses } from './inventory-masters'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    movement_type: stockMovementTypeEnum('movement_type').notNull(),
    status: stockMovementStatusEnum('status').notNull().default('draft'),
    internal_number: varchar('internal_number', { length: 40 }),
    source_warehouse_id: uuid('source_warehouse_id').notNull(),
    target_warehouse_id: uuid('target_warehouse_id'),
    project_id: uuid('project_id'),
    movement_date: date('movement_date').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('PHP'),
    reason: text('reason').notNull(),
    posting_journal_entry_id: uuid('posting_journal_entry_id'),
    reversal_journal_entry_id: uuid('reversal_journal_entry_id'),
    posted_by: uuid('posted_by'),
    posted_at: timestamp('posted_at', { withTimezone: true }),
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
    tenantIdUniqueIdx: uniqueIndex('ux_stock_movements_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantNumberIdx: uniqueIndex('ux_stock_movements_tenant_number')
      .on(table.tenant_id, table.internal_number)
      .where(sql`${table.internal_number} is not null`),
    tenantStatusDateIdx: index(
      'idx_stock_movements_tenant_status_date'
    ).on(table.tenant_id, table.status, table.movement_date),
    sourceWarehouseIdx: index('idx_stock_movements_source_warehouse').on(
      table.tenant_id,
      table.source_warehouse_id
    ),
    targetWarehouseIdx: index('idx_stock_movements_target_warehouse')
      .on(table.tenant_id, table.target_warehouse_id)
      .where(sql`${table.target_warehouse_id} is not null`),
    projectIdx: index('idx_stock_movements_project')
      .on(table.tenant_id, table.project_id)
      .where(sql`${table.project_id} is not null`),
    sourceWarehouseTenantFk: foreignKey({
      name: 'stock_movements_source_warehouse_tenant_fk',
      columns: [table.tenant_id, table.source_warehouse_id],
      foreignColumns: [warehouses.tenant_id, warehouses.id],
    }).onDelete('restrict'),
    targetWarehouseTenantFk: foreignKey({
      name: 'stock_movements_target_warehouse_tenant_fk',
      columns: [table.tenant_id, table.target_warehouse_id],
      foreignColumns: [warehouses.tenant_id, warehouses.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'stock_movements_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    postingJournalTenantFk: foreignKey({
      name: 'stock_movements_posting_journal_tenant_fk',
      columns: [table.tenant_id, table.posting_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    reversalJournalTenantFk: foreignKey({
      name: 'stock_movements_reversal_journal_tenant_fk',
      columns: [table.tenant_id, table.reversal_journal_entry_id],
      foreignColumns: [journalEntries.tenant_id, journalEntries.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'stock_movements_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    postedByTenantFk: foreignKey({
      name: 'stock_movements_posted_by_tenant_fk',
      columns: [table.tenant_id, table.posted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    reversedByTenantFk: foreignKey({
      name: 'stock_movements_reversed_by_tenant_fk',
      columns: [table.tenant_id, table.reversed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    reasonCheck: check(
      'stock_movements_reason_nonempty',
      sql`length(btrim(${table.reason})) >= 3`
    ),
    currencyCheck: check(
      'stock_movements_currency_format',
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    distinctWarehousesCheck: check(
      'stock_movements_distinct_warehouses',
      sql`${table.target_warehouse_id} is null or ${table.target_warehouse_id} <> ${table.source_warehouse_id}`
    ),
  })
)

export const stockMovementLines = pgTable(
  'stock_movement_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    stock_movement_id: uuid('stock_movement_id').notNull(),
    material_item_id: uuid('material_item_id').notNull(),
    uom_id: uuid('uom_id').notNull(),
    cost_code_id: uuid('cost_code_id'),
    line_number: integer('line_number').notNull(),
    description: text('description').notNull(),
    quantity_micros: bigint('quantity_micros', { mode: 'number' }).notNull(),
    declared_unit_cost_cents: bigint('declared_unit_cost_cents', {
      mode: 'number',
    }),
    posted_unit_cost_cents: bigint('posted_unit_cost_cents', {
      mode: 'number',
    }),
    posted_value_cents: bigint('posted_value_cents', { mode: 'number' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_stock_movement_lines_tenant_id_id'
    ).on(table.tenant_id, table.id),
    movementLineIdx: uniqueIndex(
      'ux_stock_movement_lines_movement_line'
    ).on(table.stock_movement_id, table.line_number),
    movementItemIdx: uniqueIndex(
      'ux_stock_movement_lines_movement_item'
    ).on(table.stock_movement_id, table.material_item_id),
    itemIdx: index('idx_stock_movement_lines_item').on(
      table.tenant_id,
      table.material_item_id
    ),
    costCodeIdx: index('idx_stock_movement_lines_cost_code')
      .on(table.tenant_id, table.cost_code_id)
      .where(sql`${table.cost_code_id} is not null`),
    movementTenantFk: foreignKey({
      name: 'stock_movement_lines_movement_tenant_fk',
      columns: [table.tenant_id, table.stock_movement_id],
      foreignColumns: [stockMovements.tenant_id, stockMovements.id],
    }).onDelete('cascade'),
    materialTenantFk: foreignKey({
      name: 'stock_movement_lines_material_tenant_fk',
      columns: [table.tenant_id, table.material_item_id],
      foreignColumns: [materialItems.tenant_id, materialItems.id],
    }).onDelete('restrict'),
    uomTenantFk: foreignKey({
      name: 'stock_movement_lines_uom_tenant_fk',
      columns: [table.tenant_id, table.uom_id],
      foreignColumns: [unitsOfMeasure.tenant_id, unitsOfMeasure.id],
    }).onDelete('restrict'),
    costCodeTenantFk: foreignKey({
      name: 'stock_movement_lines_cost_code_tenant_fk',
      columns: [table.tenant_id, table.cost_code_id],
      foreignColumns: [costCodes.tenant_id, costCodes.id],
    }).onDelete('restrict'),
    lineNumberCheck: check(
      'stock_movement_lines_number_positive',
      sql`${table.line_number} > 0`
    ),
    descriptionCheck: check(
      'stock_movement_lines_description_nonempty',
      sql`length(btrim(${table.description})) > 0`
    ),
    quantityCheck: check(
      'stock_movement_lines_quantity_nonzero',
      sql`${table.quantity_micros} <> 0`
    ),
    declaredCostCheck: check(
      'stock_movement_lines_declared_cost_positive',
      sql`${table.declared_unit_cost_cents} is null or ${table.declared_unit_cost_cents} > 0`
    ),
    postedCostCheck: check(
      'stock_movement_lines_posted_cost_positive',
      sql`(
        (${table.posted_unit_cost_cents} is null and ${table.posted_value_cents} is null)
        or
        (${table.posted_unit_cost_cents} > 0 and ${table.posted_value_cents} > 0)
      )`
    ),
  })
)

export type StockMovement = typeof stockMovements.$inferSelect
export type StockMovementInsert = typeof stockMovements.$inferInsert
export type StockMovementLine = typeof stockMovementLines.$inferSelect
export type StockMovementLineInsert = typeof stockMovementLines.$inferInsert
