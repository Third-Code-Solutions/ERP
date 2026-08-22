import { sql } from 'drizzle-orm'
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
  varchar,
} from 'drizzle-orm/pg-core'
import { projectStatusEnum, projectTypeEnum } from './enums'
import { tenants } from './tenants'
import { accounts } from './accounts'
import { users } from './users'

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    // REFACTOR.md M1 US-005 — projects are created from won opportunities,
    // each one tied to an Account. Nullable for legacy projects pre-refactor.
    account_id: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    // Free-text client name kept for display continuity; the canonical
    // Account record (when present) overrides this in the UI.
    client: varchar('client', { length: 255 }).notNull(),
    // Assigned once a signed BOM is promoted into an execution project. This
    // remains nullable for legacy project rows created before WO-13.
    project_code: varchar('project_code', { length: 40 }),
    location: text('location'),
    project_type: projectTypeEnum('project_type'),
    status: projectStatusEnum('status').notNull().default('lead'),
    total_sqm: integer('total_sqm'),
    notes: text('notes'),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    // A project is retired instead of physically deleted so construction,
    // financial, procurement, drawing, and audit evidence remains intact.
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
    deleted_by: uuid('deleted_by'),
    deletion_reason: text('deletion_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_projects_tenant_id_id').on(table.tenant_id, table.id),
    tenantIdx: index('idx_projects_tenant_id').on(table.tenant_id),
    accountIdx: index('idx_projects_account_id').on(table.account_id),
    projectCodeIdx: uniqueIndex('ux_projects_tenant_project_code')
      .on(table.tenant_id, table.project_code)
      .where(sql`${table.project_code} is not null`),
    tenantStatusIdx: index('idx_projects_tenant_status').on(table.tenant_id, table.status),
    createdByIdx: index('idx_projects_created_by').on(table.created_by),
    tenantActiveIdx: index('idx_projects_tenant_active').on(
      table.tenant_id,
      table.deleted_at,
    ),
    deletedByIdx: index('idx_projects_deleted_by').on(table.deleted_by),
    deletedByTenantFk: foreignKey({
      name: 'projects_deleted_by_tenant_fk',
      columns: [table.tenant_id, table.deleted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    retirementMetadataCheck: check(
      'projects_retirement_metadata_consistent',
      sql`(
        (${table.deleted_at} is null
          and ${table.deleted_by} is null
          and ${table.deletion_reason} is null)
        or
        (${table.deleted_at} is not null
          and ${table.deleted_by} is not null
          and length(btrim(${table.deletion_reason})) > 0)
      )`,
    ),
  })
)

export type Project = typeof projects.$inferSelect
export type ProjectInsert = typeof projects.$inferInsert
