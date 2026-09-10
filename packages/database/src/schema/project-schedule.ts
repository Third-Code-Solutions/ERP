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

export const projectScheduleLevelEnum = pgEnum('project_schedule_level', [
  'l1',
  'l2',
  'l3',
  'l4',
])

export const projectScheduleTaskStatusEnum = pgEnum('project_schedule_task_status', [
  'planned',
  'in_progress',
  'blocked',
  'completed',
  'cancelled',
])

export const projectScheduleCommitmentStatusEnum = pgEnum('project_schedule_commitment_status', [
  'not_set',
  'committed',
  'complete',
  'not_done',
])

export const projectScheduleSourceEnum = pgEnum('project_schedule_source', [
  'manual',
  'legacy_l1',
  'ms_project',
])

/** Normalized L1-L4/Last-Planner task spine; legacy JSON schedules remain intact. */
export const projectScheduleTasks = pgTable(
  'project_schedule_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    level: projectScheduleLevelEnum('level').notNull(),
    task_code: varchar('task_code', { length: 80 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description').notNull().default(''),
    parent_task_id: uuid('parent_task_id'),
    predecessor_task_id: uuid('predecessor_task_id'),
    planned_start: date('planned_start', { mode: 'string' }).notNull(),
    planned_finish: date('planned_finish', { mode: 'string' }).notNull(),
    actual_start: date('actual_start', { mode: 'string' }),
    actual_finish: date('actual_finish', { mode: 'string' }),
    percent_complete: integer('percent_complete').notNull().default(0),
    planned_labor_minutes: integer('planned_labor_minutes').notNull().default(0),
    actual_labor_minutes: integer('actual_labor_minutes').notNull().default(0),
    status: projectScheduleTaskStatusEnum('status').notNull().default('planned'),
    commitment_week: date('commitment_week', { mode: 'string' }),
    commitment_status: projectScheduleCommitmentStatusEnum('commitment_status').notNull().default('not_set'),
    constraint_reason: text('constraint_reason').notNull().default(''),
    owner_id: uuid('owner_id'),
    source: projectScheduleSourceEnum('source').notNull().default('manual'),
    client_request_id: uuid('client_request_id').notNull(),
    request_hash: varchar('request_hash', { length: 64 }).notNull(),
    version: integer('version').notNull().default(1),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_project_schedule_tasks_tenant_id_id').on(table.tenant_id, table.id),
    taskCodeUq: uniqueIndex('ux_project_schedule_tasks_tenant_project_level_code').on(table.tenant_id, table.project_id, table.level, table.task_code),
    clientRequestUq: uniqueIndex('ux_project_schedule_tasks_tenant_client_request').on(table.tenant_id, table.client_request_id),
    projectLevelIdx: index('idx_project_schedule_tasks_project_level').on(table.tenant_id, table.project_id, table.level, table.planned_start),
    commitmentIdx: index('idx_project_schedule_tasks_commitment').on(table.tenant_id, table.project_id, table.commitment_week, table.commitment_status),
    statusIdx: index('idx_project_schedule_tasks_status').on(table.tenant_id, table.project_id, table.status, table.planned_finish),
    taskCodeNonempty: check('project_schedule_tasks_task_code_nonempty', sql`${table.task_code} = btrim(${table.task_code}) and length(${table.task_code}) > 0`),
    nameNonempty: check('project_schedule_tasks_name_nonempty', sql`${table.name} = btrim(${table.name}) and length(${table.name}) > 0`),
    plannedDateRange: check('project_schedule_tasks_planned_date_range', sql`${table.planned_finish} >= ${table.planned_start}`),
    actualDateRange: check('project_schedule_tasks_actual_date_range', sql`${table.actual_start} is null or ${table.actual_finish} is null or ${table.actual_finish} >= ${table.actual_start}`),
    percentRange: check('project_schedule_tasks_percent_range', sql`${table.percent_complete} between 0 and 100`),
    laborRange: check('project_schedule_tasks_labor_range', sql`${table.planned_labor_minutes} >= 0 and ${table.actual_labor_minutes} >= 0`),
    versionPositive: check('project_schedule_tasks_version_positive', sql`${table.version} >= 1`),
    requestHashLength: check('project_schedule_tasks_request_hash_length', sql`length(${table.request_hash}) = 64`),
    completedConsistency: check('project_schedule_tasks_completed_consistency', sql`(${table.status} <> 'completed' or (${table.percent_complete} = 100 and ${table.actual_finish} is not null))`),
    notDoneReason: check('project_schedule_tasks_not_done_reason', sql`${table.commitment_status} <> 'not_done' or length(btrim(${table.constraint_reason})) > 0`),
    projectTenantFk: foreignKey({ name: 'project_schedule_tasks_project_tenant_fk', columns: [table.tenant_id, table.project_id], foreignColumns: [projects.tenant_id, projects.id] }).onDelete('cascade'),
    parentTenantFk: foreignKey({ name: 'project_schedule_tasks_parent_tenant_fk', columns: [table.tenant_id, table.parent_task_id], foreignColumns: [table.tenant_id, table.id] }).onDelete('set null'),
    predecessorTenantFk: foreignKey({ name: 'project_schedule_tasks_predecessor_tenant_fk', columns: [table.tenant_id, table.predecessor_task_id], foreignColumns: [table.tenant_id, table.id] }).onDelete('set null'),
    ownerTenantFk: foreignKey({ name: 'project_schedule_tasks_owner_tenant_fk', columns: [table.tenant_id, table.owner_id], foreignColumns: [users.tenant_id, users.id] }).onDelete('set null'),
    createdByTenantFk: foreignKey({ name: 'project_schedule_tasks_created_by_tenant_fk', columns: [table.tenant_id, table.created_by], foreignColumns: [users.tenant_id, users.id] }).onDelete('restrict'),
  }),
)

export type ProjectScheduleTask = typeof projectScheduleTasks.$inferSelect
export type ProjectScheduleTaskInsert = typeof projectScheduleTasks.$inferInsert
