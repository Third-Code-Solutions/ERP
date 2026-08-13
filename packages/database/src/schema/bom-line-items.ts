import {
  boolean,
  bigint,
  check,
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
import { sql } from 'drizzle-orm'
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
    // Build-ops grain discriminator. Ambiguous rows use work_item as the
    // storage placeholder while classification_status remains review.
    kind: text('kind').notNull().default('work_item'),
    parent_line_item_id: uuid('parent_line_item_id'),
    location_id: uuid('location_id'),
    division_id: uuid('division_id'),
    item_no: text('item_no'),
    drawing_revision_id: uuid('drawing_revision_id'),
    takeoff_import_id: uuid('takeoff_import_id'),
    source_row_key: text('source_row_key'),
    ai_drafted: boolean('ai_drafted').notNull().default(false),
    source_model: text('source_model'),
    extraction_timestamp: timestamp('extraction_timestamp', { withTimezone: true }),
    unit_rate_source: text('unit_rate_source').notNull().default('manual'),
    classification_status: text('classification_status').notNull().default('classified'),
    classification_reason: text('classification_reason'),
    // Preserve the source description when WO-05 normalizes a room/location prefix.
    description_original: text('description_original'),
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
    tenantIdUniqueIdx: uniqueIndex('ux_bom_line_items_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantBomIdUniqueIdx: uniqueIndex('ux_bom_line_items_tenant_bom_id_id').on(
      table.tenant_id,
      table.bom_id,
      table.id,
    ),
    bomIdx: index('idx_bom_line_items_bom_id').on(table.bom_id),
    parentIdx: index('idx_bom_line_items_parent_id').on(table.parent_id),
    tenantParentLineIdx: index('idx_bom_line_items_tenant_parent_line_item').on(
      table.tenant_id,
      table.parent_line_item_id,
    ),
    tenantKindIdx: index('idx_bom_line_items_tenant_kind').on(table.tenant_id, table.kind),
    takeoffSourceRowUniqueIdx: uniqueIndex('ux_bom_line_items_takeoff_source_row').on(
      table.tenant_id,
      table.takeoff_import_id,
      table.source_row_key,
    ),
    kindCheck: check(
      'bom_line_items_kind_check',
      sql`${table.kind} in ('work_item', 'material_line')`,
    ),
    unitRateSourceCheck: check(
      'bom_line_items_unit_rate_source_check',
      sql`${table.unit_rate_source} in ('dupa', 'manual', 'client_boq')`,
    ),
    classificationStatusCheck: check(
      'bom_line_items_classification_status_check',
      sql`${table.classification_status} in ('classified', 'review')`,
    ),
    parentTenantFk: foreignKey({
      name: 'bom_line_items_parent_bom_tenant_fk',
      columns: [table.tenant_id, table.bom_id, table.parent_line_item_id],
      foreignColumns: [table.tenant_id, table.bom_id, table.id],
    }).onDelete('restrict'),
  })
)

export type BomLineItem = typeof bomLineItems.$inferSelect
export type BomLineItemInsert = typeof bomLineItems.$inferInsert
