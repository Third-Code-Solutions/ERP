import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

/** One authoritative daily site diary per project calendar day. */
export const siteDiaryStatusEnum = pgEnum('site_diary_status', [
  'draft',
  'submitted',
])

export const siteDiaryEntries = pgTable(
  'site_diary_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    diary_date: date('diary_date', { mode: 'string' }).notNull(),
    status: siteDiaryStatusEnum('status').notNull().default('draft'),
    weather: varchar('weather', { length: 160 }).notNull().default(''),
    manpower_count: integer('manpower_count').notNull().default(0),
    work_completed: text('work_completed').notNull().default(''),
    constraints: text('constraints').notNull().default(''),
    safety_notes: text('safety_notes').notNull().default(''),
    created_by: uuid('created_by').notNull(),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    submitted_by: uuid('submitted_by'),
    /** Stable client token keeps an offline/retried create from duplicating a day. */
    client_request_id: uuid('client_request_id').notNull(),
    version: integer('version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_site_diary_entries_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    tenantProjectDateUq: uniqueIndex('ux_site_diary_entries_tenant_project_date').on(
      table.tenant_id,
      table.project_id,
      table.diary_date,
    ),
    tenantClientRequestUq: uniqueIndex('ux_site_diary_entries_tenant_client_request').on(
      table.tenant_id,
      table.client_request_id,
    ),
    tenantProjectDateIdx: index('idx_site_diary_entries_project_date').on(
      table.tenant_id,
      table.project_id,
      table.diary_date,
    ),
    projectStatusIdx: index('idx_site_diary_entries_project_status').on(
      table.tenant_id,
      table.project_id,
      table.status,
    ),
    manpowerCheck: check(
      'site_diary_entries_manpower_nonnegative',
      sql`${table.manpower_count} >= 0`,
    ),
    versionCheck: check(
      'site_diary_entries_version_positive',
      sql`${table.version} >= 1`,
    ),
    projectTenantFk: foreignKey({
      name: 'site_diary_entries_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    createdByTenantFk: foreignKey({
      name: 'site_diary_entries_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    submittedByTenantFk: foreignKey({
      name: 'site_diary_entries_submitted_by_tenant_fk',
      columns: [table.tenant_id, table.submitted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
  }),
)

export type SiteDiaryEntry = typeof siteDiaryEntries.$inferSelect
export type SiteDiaryEntryInsert = typeof siteDiaryEntries.$inferInsert
