import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const projectLocations = pgTable(
  'project_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    parent_id: uuid('parent_id'),
    name: text('name').notNull(),
    level: text('level'),
    sort_order: integer('sort_order').notNull().default(0),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_project_locations_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    tenantProjectIdUniqueIdx: uniqueIndex('ux_project_locations_tenant_project_id_id').on(
      table.tenant_id,
      table.project_id,
      table.id,
    ),
    tenantProjectNameUniqueIdx: uniqueIndex('ux_project_locations_tenant_project_name').on(
      table.tenant_id,
      table.project_id,
      table.name,
    ),
    projectIdx: index('idx_project_locations_tenant_project').on(
      table.tenant_id,
      table.project_id,
      table.sort_order,
    ),
    parentIdx: index('idx_project_locations_tenant_parent').on(
      table.tenant_id,
      table.project_id,
      table.parent_id,
    ),
    nameNonemptyCheck: check(
      'project_locations_name_nonempty',
      sql`length(btrim(${table.name})) > 0`,
    ),
    levelCheck: check(
      'project_locations_level_check',
      sql`${table.level} is null or ${table.level} in ('building', 'floor', 'zone', 'room', 'area')`,
    ),
    projectTenantFk: foreignKey({
      name: 'project_locations_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    parentTenantProjectFk: foreignKey({
      name: 'project_locations_parent_tenant_project_fk',
      columns: [table.tenant_id, table.project_id, table.parent_id],
      foreignColumns: [table.tenant_id, table.project_id, table.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'project_locations_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'project_locations_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export type ProjectLocation = typeof projectLocations.$inferSelect
export type ProjectLocationInsert = typeof projectLocations.$inferInsert
