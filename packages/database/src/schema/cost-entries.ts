import { pgTable, uuid, varchar, text, bigint, integer, timestamp, index, foreignKey, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { costCategoryEnum, costSourceEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'
import { bomLineItems } from './bom-line-items'
import { poLineItems } from './po-line-items'
import { costCodes } from './budgets'

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
    cost_code_id: uuid('cost_code_id'),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    voided_at: timestamp('voided_at', { withTimezone: true }),
    voided_by: uuid('voided_by'),
    void_reason: text('void_reason'),
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
    tenantIdUniqueIdx: uniqueIndex('ux_cost_entries_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantIdx: index('idx_cost_entries_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_cost_entries_project_id').on(table.project_id),
    bomLineItemIdx: index('idx_cost_entries_bom_line_item_id').on(
      table.bom_line_item_id
    ),
    poLineItemIdx: index('idx_cost_entries_po_line_item_id').on(
      table.po_line_item_id
    ),
    costCodeIdx: index('idx_cost_entries_cost_code').on(
      table.tenant_id,
      table.cost_code_id
    ),
    bomLineTenantFk: foreignKey({
      columns: [table.tenant_id, table.bom_line_item_id],
      foreignColumns: [bomLineItems.tenant_id, bomLineItems.id],
      name: 'cost_entries_bom_line_tenant_fk',
    }).onDelete('restrict'),
    poLineTenantFk: foreignKey({
      columns: [table.tenant_id, table.po_line_item_id],
      foreignColumns: [poLineItems.tenant_id, poLineItems.id],
      name: 'cost_entries_po_line_tenant_fk',
    }).onDelete('restrict'),
    costCodeTenantFk: foreignKey({
      columns: [table.tenant_id, table.cost_code_id],
      foreignColumns: [costCodes.tenant_id, costCodes.id],
      name: 'cost_entries_cost_code_tenant_fk',
    }).onDelete('restrict'),
    voidedByTenantFk: foreignKey({
      columns: [table.tenant_id, table.voided_by],
      foreignColumns: [users.tenant_id, users.id],
      name: 'cost_entries_voided_by_tenant_fk',
    }).onDelete('restrict'),
    voidStateCheck: check(
      'cost_entries_void_state',
      sql`(
        (${table.voided_at} is null and ${table.voided_by} is null and ${table.void_reason} is null)
        or
        (${table.voided_at} is not null and ${table.voided_by} is not null and ${table.void_reason} is not null and length(btrim(${table.void_reason})) between 1 and 500)
      )`
    ),
    tenantCategoryIdx: index('idx_cost_entries_tenant_category').on(table.tenant_id, table.cost_category),
    incurredIdx: index('idx_cost_entries_incurred').on(table.tenant_id, table.incurred_at),
    activeProjectIdx: index('idx_cost_entries_active_project').on(
      table.tenant_id,
      table.project_id,
      table.voided_at
    ),
  })
)

export type CostEntry = typeof costEntries.$inferSelect
export type CostEntryInsert = typeof costEntries.$inferInsert
