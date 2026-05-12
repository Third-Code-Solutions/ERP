import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core'
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
    location: text('location'),
    project_type: projectTypeEnum('project_type'),
    status: projectStatusEnum('status').notNull().default('lead'),
    total_sqm: integer('total_sqm'),
    notes: text('notes'),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_projects_tenant_id').on(table.tenant_id),
    accountIdx: index('idx_projects_account_id').on(table.account_id),
    tenantStatusIdx: index('idx_projects_tenant_status').on(table.tenant_id, table.status),
    createdByIdx: index('idx_projects_created_by').on(table.created_by),
  })
)

export type Project = typeof projects.$inferSelect
export type ProjectInsert = typeof projects.$inferInsert
