import { pgTable, uuid, varchar, text, integer, bigint, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { purchaseOrders } from './purchase-orders'

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
    quantity: integer('quantity').notNull().default(0),
    unit_cost_cents: bigint('unit_cost_cents', { mode: 'number' }).notNull().default(0),
    line_total_cents: bigint('line_total_cents', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_po_line_items_tenant_id').on(table.tenant_id),
    poIdx: index('idx_po_line_items_po_id').on(table.po_id),
  })
)

export type PoLineItem = typeof poLineItems.$inferSelect
export type PoLineItemInsert = typeof poLineItems.$inferInsert
