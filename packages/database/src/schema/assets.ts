import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { assetKindEnum, assetStatusEnum } from './enums'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    asset_tag: varchar('asset_tag', { length: 64 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    kind: assetKindEnum('kind').notNull().default('equipment'),
    status: assetStatusEnum('status').notNull().default('active'),
    serial_number: varchar('serial_number', { length: 120 }),
    manufacturer: varchar('manufacturer', { length: 120 }),
    model: varchar('model', { length: 120 }),
    assigned_project_id: uuid('assigned_project_id'),
    location: varchar('location', { length: 255 }),
    commissioned_on: date('commissioned_on'),
    retired_on: date('retired_on'),
    notes: text('notes'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_assets_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    tenantTagUniqueIdx: uniqueIndex('ux_assets_tenant_tag').on(
      table.tenant_id,
      table.asset_tag
    ),
    tenantSerialUniqueIdx: uniqueIndex('ux_assets_tenant_serial')
      .on(table.tenant_id, table.serial_number)
      .where(sql`${table.serial_number} is not null`),
    tenantStatusIdx: index('idx_assets_tenant_status').on(
      table.tenant_id,
      table.status
    ),
    tenantProjectIdx: index('idx_assets_tenant_project').on(
      table.tenant_id,
      table.assigned_project_id
    ),
    assignedProjectTenantFk: foreignKey({
      name: 'assets_assigned_project_tenant_fk',
      columns: [table.tenant_id, table.assigned_project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'assets_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    assetTagNonempty: check(
      'assets_asset_tag_nonempty',
      sql`${table.asset_tag} = btrim(${table.asset_tag}) and length(${table.asset_tag}) between 1 and 64`
    ),
    nameNonempty: check(
      'assets_name_nonempty',
      sql`${table.name} = btrim(${table.name}) and length(${table.name}) between 1 and 160`
    ),
    retiredStateCheck: check(
      'assets_retired_state',
      sql`${table.status} <> 'retired' or ${table.retired_on} is not null`
    ),
    dateOrderCheck: check(
      'assets_date_order',
      sql`${table.retired_on} is null or ${table.commissioned_on} is null or ${table.retired_on} >= ${table.commissioned_on}`
    ),
  })
)

export type Asset = typeof assets.$inferSelect
export type AssetInsert = typeof assets.$inferInsert
