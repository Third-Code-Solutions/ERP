import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { bomLineItems } from './bom-line-items'
import { boms } from './boms'
import { tenants } from './tenants'
import { users } from './users'

export const bomLineItemGrainReviews = pgTable(
  'bom_line_item_grain_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    bom_id: uuid('bom_id').notNull(),
    bom_line_item_id: uuid('bom_line_item_id').notNull(),
    proposed_kind: text('proposed_kind'),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    resolved_kind: text('resolved_kind'),
    resolved_parent_line_item_id: uuid('resolved_parent_line_item_id'),
    created_by: uuid('created_by'),
    resolved_by: uuid('resolved_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    tenantLineIdx: index('idx_bom_line_item_grain_reviews_tenant_bom_line').on(
      table.tenant_id,
      table.bom_id,
      table.bom_line_item_id,
    ),
    pendingUniqueIdx: uniqueIndex('ux_bom_line_item_grain_reviews_pending_line').on(
      table.tenant_id,
      table.bom_line_item_id,
    ).where(sql`${table.status} = 'pending'`),
    tenantIdUniqueIdx: uniqueIndex('ux_bom_line_item_grain_reviews_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    statusCheck: check(
      'bom_line_item_grain_reviews_status_check',
      sql`${table.status} in ('pending', 'resolved', 'rejected')`,
    ),
    proposedKindCheck: check(
      'bom_line_item_grain_reviews_proposed_kind_check',
      sql`${table.proposed_kind} is null or ${table.proposed_kind} in ('work_item', 'material_line')`,
    ),
    resolvedKindCheck: check(
      'bom_line_item_grain_reviews_resolved_kind_check',
      sql`${table.resolved_kind} is null or ${table.resolved_kind} in ('work_item', 'material_line')`,
    ),
    resolvedShapeCheck: check(
      'bom_line_item_grain_reviews_resolved_shape_check',
      sql`${table.status} <> 'resolved' or (${table.resolved_kind} is not null and (${table.resolved_kind} = 'work_item' or ${table.resolved_parent_line_item_id} is not null))`,
    ),
    lineTenantFk: foreignKey({
      name: 'bom_line_item_grain_reviews_line_bom_tenant_fk',
      columns: [table.tenant_id, table.bom_id, table.bom_line_item_id],
      foreignColumns: [bomLineItems.tenant_id, bomLineItems.bom_id, bomLineItems.id],
    }).onDelete('cascade'),
    bomTenantFk: foreignKey({
      name: 'bom_line_item_grain_reviews_bom_tenant_fk',
      columns: [table.tenant_id, table.bom_id],
      foreignColumns: [boms.tenant_id, boms.id],
    }).onDelete('cascade'),
    resolvedParentTenantFk: foreignKey({
      name: 'bom_line_item_grain_reviews_parent_bom_tenant_fk',
      columns: [table.tenant_id, table.bom_id, table.resolved_parent_line_item_id],
      foreignColumns: [bomLineItems.tenant_id, bomLineItems.bom_id, bomLineItems.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'bom_line_item_grain_reviews_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    resolvedByTenantFk: foreignKey({
      name: 'bom_line_item_grain_reviews_resolved_by_tenant_fk',
      columns: [table.tenant_id, table.resolved_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'bom_line_item_grain_reviews_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export type BomLineItemGrainReview = typeof bomLineItemGrainReviews.$inferSelect
export type BomLineItemGrainReviewInsert = typeof bomLineItemGrainReviews.$inferInsert
