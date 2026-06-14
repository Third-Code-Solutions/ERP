import { pgTable, uuid, varchar, text, bigint, integer, timestamp, index } from 'drizzle-orm/pg-core'
import { costCategoryEnum, costSourceEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'

// Phase 3 / F3.2 — Cost Tracking. The actual cost incurred on a project, the
// third leg of the execution triangle: BOM (budget) → POs (committed) →
// cost_entries (actual). Powers per-project variance and GP-erosion signals.
// NO billing — this is execution-side spend, not client invoicing.
export const costEntries = pgTable(
  'cost_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    // Optional tie to a BOM line (line-level variance) / PO line (future auto-ingest).
    bom_line_item_id: uuid('bom_line_item_id'),
    po_line_item_id: uuid('po_line_item_id'),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    cost_category: costCategoryEnum('cost_category').notNull(),
    cost_source: costSourceEnum('cost_source').notNull().default('manual'),
    description: text('description').notNull(),
    // PHP centavos. Non-negative (enforced in the action's Zod schema).
    amount_cents: bigint('amount_cents', { mode: 'number' }).notNull().default(0),
    quantity: integer('quantity').notNull().default(1),
    unit: varchar('unit', { length: 20 }),
    incurred_at: timestamp('incurred_at', { withTimezone: true }).notNull().defaultNow(),
    reference_number: varchar('reference_number', { length: 100 }),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_cost_entries_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_cost_entries_project_id').on(table.project_id),
    tenantCategoryIdx: index('idx_cost_entries_tenant_category').on(table.tenant_id, table.cost_category),
    incurredIdx: index('idx_cost_entries_incurred').on(table.tenant_id, table.incurred_at),
  })
)

export type CostEntry = typeof costEntries.$inferSelect
export type CostEntryInsert = typeof costEntries.$inferInsert
