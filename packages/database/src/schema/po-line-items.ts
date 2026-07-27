import { sql } from 'drizzle-orm'
import { pgTable, uuid, varchar, text, integer, bigint, timestamp, index, uniqueIndex, foreignKey, check } from 'drizzle-orm/pg-core'
import { materialItems } from './bom-extras'
import { bomLineItems } from './bom-line-items'
import { costCodes } from './budgets'
import { unitsOfMeasure } from './inventory-masters'
import { tenants } from './tenants'
import { purchaseOrders } from './purchase-orders'
import { users } from './users'

export const poLineItems = pgTable(
  'po_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    po_id: uuid('po_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    sort_order: integer('sort_order').notNull().default(0),
    code: varchar('code', { length: 50 }),
    description: text('description').notNull(),
    unit: varchar('unit', { length: 20 }),
    material_item_id: uuid('material_item_id'),
    bom_line_item_id: uuid('bom_line_item_id'),
    cost_code_id: uuid('cost_code_id'),
    uom_id: uuid('uom_id'),
    quantity: integer('quantity').notNull().default(0),
    quantity_micros: bigint('quantity_micros', { mode: 'number' })
      .notNull()
      .default(0),
    unit_cost_cents: bigint('unit_cost_cents', { mode: 'number' }).notNull().default(0),
    line_total_cents: bigint('line_total_cents', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    // Partial-receipt tracking. received_qty == quantity → fully received.
    // received_at/received_by are nullable until the first receive action.
    received_qty: integer('received_qty').notNull().default(0),
    received_quantity_micros: bigint('received_quantity_micros', {
      mode: 'number',
    })
      .notNull()
      .default(0),
    legacy_received_quantity_micros: bigint(
      'legacy_received_quantity_micros',
      { mode: 'number' }
    )
      .notNull()
      .default(0),
    received_at: timestamp('received_at', { withTimezone: true }),
    received_by: uuid('received_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_po_line_items_tenant_id').on(table.tenant_id),
    tenantIdUniqueIdx: uniqueIndex('ux_po_line_items_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    poIdx: index('idx_po_line_items_po_id').on(table.po_id),
    materialItemIdx: index('idx_po_line_items_material_item').on(
      table.tenant_id,
      table.material_item_id
    ),
    costCodeIdx: index('idx_po_line_items_cost_code').on(
      table.tenant_id,
      table.cost_code_id
    ),
    materialTenantFk: foreignKey({
      name: 'po_line_items_material_item_tenant_fk',
      columns: [table.tenant_id, table.material_item_id],
      foreignColumns: [materialItems.tenant_id, materialItems.id],
    }).onDelete('restrict'),
    bomLineTenantFk: foreignKey({
      name: 'po_line_items_bom_line_tenant_fk',
      columns: [table.tenant_id, table.bom_line_item_id],
      foreignColumns: [bomLineItems.tenant_id, bomLineItems.id],
    }).onDelete('restrict'),
    costCodeTenantFk: foreignKey({
      name: 'po_line_items_cost_code_tenant_fk',
      columns: [table.tenant_id, table.cost_code_id],
      foreignColumns: [costCodes.tenant_id, costCodes.id],
    }).onDelete('restrict'),
    uomTenantFk: foreignKey({
      name: 'po_line_items_uom_tenant_fk',
      columns: [table.tenant_id, table.uom_id],
      foreignColumns: [unitsOfMeasure.tenant_id, unitsOfMeasure.id],
    }).onDelete('restrict'),
    quantityMicrosCheck: check(
      'po_line_items_quantity_micros_nonnegative',
      sql`${table.quantity_micros} >= 0`
    ),
    receivedMicrosCheck: check(
      'po_line_items_received_micros_range',
      sql`${table.legacy_received_quantity_micros} >= 0
        and ${table.legacy_received_quantity_micros} <= ${table.quantity_micros}
        and ${table.received_quantity_micros} >= ${table.legacy_received_quantity_micros}
        and ${table.received_quantity_micros} <= ${table.quantity_micros}`
    ),
  })
)

export type PoLineItem = typeof poLineItems.$inferSelect
export type PoLineItemInsert = typeof poLineItems.$inferInsert
