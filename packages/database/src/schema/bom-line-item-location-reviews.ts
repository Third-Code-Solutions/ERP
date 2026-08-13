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
import { projectLocations } from './project-locations'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const bomLineItemLocationReviews = pgTable(
  'bom_line_item_location_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    bom_id: uuid('bom_id').notNull(),
    bom_line_item_id: uuid('bom_line_item_id').notNull(),
    description_original: text('description_original').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending'),
    resolved_location_id: uuid('resolved_location_id'),
    created_by: uuid('created_by'),
    resolved_by: uuid('resolved_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    tenantProjectLineIdx: index('idx_bom_line_item_location_reviews_tenant_project_line').on(
      table.tenant_id,
      table.project_id,
      table.bom_line_item_id,
    ),
    pendingUniqueIdx: uniqueIndex('ux_bom_line_item_location_reviews_pending_line').on(
      table.tenant_id,
      table.bom_line_item_id,
    ).where(sql`${table.status} = 'pending'`),
    tenantIdUniqueIdx: uniqueIndex('ux_bom_line_item_location_reviews_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    statusCheck: check(
      'bom_line_item_location_reviews_status_check',
      sql`${table.status} in ('pending', 'resolved', 'rejected')`,
    ),
    resolvedShapeCheck: check(
      'bom_line_item_location_reviews_resolved_shape_check',
      sql`${table.status} <> 'resolved' or ${table.resolved_location_id} is not null`,
    ),
    projectTenantFk: foreignKey({
      name: 'bom_line_item_location_reviews_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    bomTenantFk: foreignKey({
      name: 'bom_line_item_location_reviews_bom_tenant_fk',
      columns: [table.tenant_id, table.bom_id],
      foreignColumns: [boms.tenant_id, boms.id],
    }).onDelete('cascade'),
    lineBomTenantFk: foreignKey({
      name: 'bom_line_item_location_reviews_line_bom_tenant_fk',
      columns: [table.tenant_id, table.bom_id, table.bom_line_item_id],
      foreignColumns: [bomLineItems.tenant_id, bomLineItems.bom_id, bomLineItems.id],
    }).onDelete('cascade'),
    resolvedLocationTenantFk: foreignKey({
      name: 'bom_line_item_location_reviews_location_tenant_fk',
      columns: [table.tenant_id, table.resolved_location_id],
      foreignColumns: [projectLocations.tenant_id, projectLocations.id],
    }).onDelete('restrict'),
    resolvedLocationProjectFk: foreignKey({
      name: 'bom_line_item_location_reviews_location_project_fk',
      columns: [table.tenant_id, table.project_id, table.resolved_location_id],
      foreignColumns: [projectLocations.tenant_id, projectLocations.project_id, projectLocations.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'bom_line_item_location_reviews_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    resolvedByTenantFk: foreignKey({
      name: 'bom_line_item_location_reviews_resolved_by_tenant_fk',
      columns: [table.tenant_id, table.resolved_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'bom_line_item_location_reviews_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export type BomLineItemLocationReview = typeof bomLineItemLocationReviews.$inferSelect
export type BomLineItemLocationReviewInsert = typeof bomLineItemLocationReviews.$inferInsert
