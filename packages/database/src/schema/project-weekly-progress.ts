import { sql } from 'drizzle-orm'
import {
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  check,
} from 'drizzle-orm/pg-core'
import { progressUpdates } from './construction'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const projectWeeklyProgressStatusEnum = pgEnum(
  'project_weekly_progress_status',
  ['open', 'locked'],
)

/** Canonical weekly capture/WAR cut-off ledger layered over legacy progress_updates. */
export const projectWeeklyProgress = pgTable(
  'project_weekly_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    progress_update_id: uuid('progress_update_id').notNull(),
    client_request_id: uuid('client_request_id').notNull(),
    request_hash: varchar('request_hash', { length: 64 }).notNull(),
    week_ending: date('week_ending', { mode: 'string' }).notNull(),
    cutoff_at: timestamp('cutoff_at', { withTimezone: true }).notNull(),
    status: projectWeeklyProgressStatusEnum('status').notNull().default('open'),
    war_snapshot: jsonb('war_snapshot'),
    locked_at: timestamp('locked_at', { withTimezone: true }),
    locked_by: uuid('locked_by'),
    lock_reason: text('lock_reason').notNull().default(''),
    version: integer('version').notNull().default(1),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_project_weekly_progress_tenant_id_id').on(table.tenant_id, table.id),
    projectWeekUniqueIdx: uniqueIndex('ux_project_weekly_progress_project_week').on(table.tenant_id, table.project_id, table.week_ending),
    requestUniqueIdx: uniqueIndex('ux_project_weekly_progress_request').on(table.tenant_id, table.client_request_id),
    projectStatusIdx: index('idx_project_weekly_progress_project_status').on(table.tenant_id, table.project_id, table.status, table.week_ending),
    projectTenantFk: foreignKey({ name: 'project_weekly_progress_project_tenant_fk', columns: [table.tenant_id, table.project_id], foreignColumns: [projects.tenant_id, projects.id] }).onDelete('cascade'),
    progressUpdateTenantFk: foreignKey({ name: 'project_weekly_progress_update_tenant_fk', columns: [table.tenant_id, table.progress_update_id], foreignColumns: [progressUpdates.tenant_id, progressUpdates.id] }).onDelete('restrict'),
    lockedByTenantFk: foreignKey({ name: 'project_weekly_progress_locked_by_tenant_fk', columns: [table.tenant_id, table.locked_by], foreignColumns: [users.tenant_id, users.id] }).onDelete('restrict'),
    createdByTenantFk: foreignKey({ name: 'project_weekly_progress_created_by_tenant_fk', columns: [table.tenant_id, table.created_by], foreignColumns: [users.tenant_id, users.id] }).onDelete('restrict'),
    requestHashCheck: check('project_weekly_progress_request_hash_length', sql`length(${table.request_hash}) = 64`),
    versionCheck: check('project_weekly_progress_version_positive', sql`${table.version} >= 1`),
    lockStateCheck: check('project_weekly_progress_lock_state', sql`(
      (${table.status} = 'open' and ${table.locked_at} is null and ${table.locked_by} is null and ${table.war_snapshot} is null)
      or
      (${table.status} = 'locked' and ${table.locked_at} is not null and ${table.locked_by} is not null and ${table.war_snapshot} is not null)
    )`),
    lockReasonCheck: check('project_weekly_progress_lock_reason_length', sql`length(${table.lock_reason}) <= 5000`),
  }),
)

export type ProjectWeeklyProgress = typeof projectWeeklyProgress.$inferSelect
export type ProjectWeeklyProgressInsert = typeof projectWeeklyProgress.$inferInsert
