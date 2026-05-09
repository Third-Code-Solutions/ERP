import { pgTable, uuid, varchar, text, integer, bigint, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { boms } from './boms'

export const bomLineItems = pgTable(
  'bom_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    bom_id: uuid('bom_id').notNull().references(() => boms.id, { onDelete: 'cascade' }),
    // Hierarchical grouping (e.g. Division > Section > Item)
    parent_id: uuid('parent_id'),
    sort_order: integer('sort_order').notNull().default(0),
    is_group: integer('is_group').notNull().default(0), // 1 if this is a group header
    code: varchar('code', { length: 50 }),
    description: text('description').notNull(),
    unit: varchar('unit', { length: 20 }),
    quantity: integer('quantity').notNull().default(0),
    // Unit cost in PHP centavos
    unit_cost_cents: bigint('unit_cost_cents', { mode: 'number' }).notNull().default(0),
    // Markup in basis points (0-10000 = 0%-100%)
    markup_bps: integer('markup_bps').notNull().default(0),
    // line_total = unit_cost_cents * quantity * (1 + markup_bps/10000)
    line_total_cents: bigint('line_total_cents', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_bom_line_items_tenant_id').on(table.tenant_id),
    bomIdx: index('idx_bom_line_items_bom_id').on(table.bom_id),
    parentIdx: index('idx_bom_line_items_parent_id').on(table.parent_id),
  })
)

export type BomLineItem = typeof bomLineItems.$inferSelect
export type BomLineItemInsert = typeof bomLineItems.$inferInsert
