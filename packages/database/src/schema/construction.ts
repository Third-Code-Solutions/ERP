import { pgTable, uuid, varchar, text, bigint, integer, timestamp, boolean, jsonb, index, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'
import { documents } from './documents'

// REFACTOR.md M5 US-Con-001 — Daily cadence tasks per role per project.
export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'done',
  'skipped',
])

export const dailyTasks = pgTable(
  'daily_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    assignee_id: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    role: varchar('role', { length: 64 }),
    due_date: timestamp('due_date', { withTimezone: true }).notNull(),
    status: taskStatusEnum('status').notNull().default('pending'),
    completion_notes: text('completion_notes'),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    completed_by: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_daily_tasks_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_daily_tasks_project_id').on(table.project_id),
    assigneeIdx: index('idx_daily_tasks_assignee_due').on(table.assignee_id, table.due_date),
    tenantStatusIdx: index('idx_daily_tasks_tenant_status').on(table.tenant_id, table.status),
  })
)

// REFACTOR.md M5 US-Con-002 — Variation Orders.
export const voStatusEnum = pgEnum('variation_order_status', [
  'draft',
  'pending_commercial_pricing',
  'pending_client_signature',
  'signed',
  'rejected',
])

export const voChangeTypeEnum = pgEnum('variation_order_change_type', [
  'client_initiated',
  'site_condition',
  'design_error',
])

export const variationOrders = pgTable(
  'variation_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    vo_number: varchar('vo_number', { length: 32 }).notNull(),
    description: text('description').notNull(),
    change_type: voChangeTypeEnum('change_type').notNull(),
    cost_impact_cents: bigint('cost_impact_cents', { mode: 'number' }).notNull().default(0),
    time_impact_days: integer('time_impact_days').notNull().default(0),
    status: voStatusEnum('status').notNull().default('draft'),
    docuseal_submission_id: varchar('docuseal_submission_id', { length: 128 }),
    signed_document_id: uuid('signed_document_id').references(() => documents.id, { onDelete: 'set null' }),
    signed_at: timestamp('signed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('idx_vos_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_vos_project_id').on(table.project_id),
  })
)

// REFACTOR.md M5 US-Con-003 — Weekly progress + Level 1 schedule.
export const masterSchedules = pgTable(
  'master_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull().default('Level 1 Master Schedule'),
    // [{name, start_date, finish_date, predecessor_index, planned_pct_curve}]
    tasks: jsonb('tasks').notNull(),
    imported_at: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    imported_by: uuid('imported_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('idx_master_schedules_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_master_schedules_project_id').on(table.project_id),
  })
)

export const progressUpdates = pgTable(
  'progress_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    week_ending: timestamp('week_ending', { withTimezone: true }).notNull(),
    // {civil_pct, electrical_pct, mep_pct, finishes_pct, overall_pct}
    percent_by_category: jsonb('percent_by_category').notNull(),
    notes: text('notes'),
    submitted_by: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_progress_updates_tenant_id').on(table.tenant_id),
    projectWeekIdx: index('idx_progress_updates_project_week').on(table.project_id, table.week_ending),
  })
)

export type DailyTask = typeof dailyTasks.$inferSelect
export type VariationOrder = typeof variationOrders.$inferSelect
export type MasterSchedule = typeof masterSchedules.$inferSelect
export type ProgressUpdate = typeof progressUpdates.$inferSelect
