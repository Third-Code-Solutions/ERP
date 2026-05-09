import { pgTable, uuid, varchar, text, integer, bigint, timestamp, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'

export const scopeItems = pgTable(
  'scope_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    code: varchar('code', { length: 50 }),
    description: text('description').notNull(),
    unit: varchar('unit', { length: 20 }).notNull(),
    quantity: integer('quantity').notNull().default(0),
    unit_cost_cents: bigint('unit_cost_cents', { mode: 'number' }).notNull().default(0),
    line_total_cents: bigint('line_total_cents', { mode: 'number' }).notNull().default(0),
    sort_order: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_scope_items_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_scope_items_project_id').on(table.project_id),
  })
)

export type ScopeItem = typeof scopeItems.$inferSelect
export type ScopeItemInsert = typeof scopeItems.$inferInsert
