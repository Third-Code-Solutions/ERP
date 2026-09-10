import { sql } from 'drizzle-orm'
import {
  check,
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

/** Project-level RFI workflow, separate from pre-Won site-inspection RFIs. */
export const projectRfiStatusEnum = pgEnum('project_rfi_status', [
  'open',
  'answered',
  'closed',
])

export const projectRfiPriorityEnum = pgEnum('project_rfi_priority', [
  'low',
  'normal',
  'high',
  'critical',
])

export const projectRfis = pgTable(
  'project_rfis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    rfi_number: varchar('rfi_number', { length: 40 }).notNull(),
    subject: varchar('subject', { length: 200 }).notNull(),
    question: text('question').notNull(),
    priority: projectRfiPriorityEnum('priority').notNull().default('normal'),
    status: projectRfiStatusEnum('status').notNull().default('open'),
    requested_by: uuid('requested_by').notNull(),
    assigned_to: uuid('assigned_to'),
    due_at: timestamp('due_at', { withTimezone: true }),
    response: text('response'),
    responded_at: timestamp('responded_at', { withTimezone: true }),
    responded_by: uuid('responded_by'),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    closed_by: uuid('closed_by'),
    /** Stable client token makes retries safe without a second idempotency table. */
    client_request_id: uuid('client_request_id'),
    version: integer('version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_project_rfis_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    tenantProjectNumberUq: uniqueIndex('ux_project_rfis_tenant_project_number').on(
      table.tenant_id,
      table.project_id,
      table.rfi_number,
    ),
    tenantClientRequestUq: uniqueIndex('ux_project_rfis_tenant_client_request')
      .on(table.tenant_id, table.client_request_id)
      .where(sql`${table.client_request_id} is not null`),
    tenantIdx: index('idx_project_rfis_tenant_id').on(table.tenant_id),
    projectStatusIdx: index('idx_project_rfis_project_status').on(
      table.tenant_id,
      table.project_id,
      table.status,
    ),
    assignedDueIdx: index('idx_project_rfis_assigned_due').on(
      table.tenant_id,
      table.assigned_to,
      table.due_at,
    ),
    versionCheck: check('project_rfis_version_positive', sql`${table.version} >= 1`),
    subjectCheck: check(
      'project_rfis_subject_nonempty',
      sql`${table.subject} = btrim(${table.subject}) and length(${table.subject}) > 0`,
    ),
    questionCheck: check(
      'project_rfis_question_nonempty',
      sql`${table.question} = btrim(${table.question}) and length(${table.question}) > 0`,
    ),
    responseMetadataCheck: check(
      'project_rfis_response_metadata_consistent',
      sql`(
        (${table.responded_at} is null and ${table.responded_by} is null and ${table.response} is null)
        or
        (${table.responded_at} is not null and ${table.responded_by} is not null and ${table.response} is not null and length(btrim(${table.response})) > 0)
      )`,
    ),
    closedMetadataCheck: check(
      'project_rfis_closed_metadata_consistent',
      sql`(
        (${table.status} = 'closed' and ${table.closed_at} is not null and ${table.closed_by} is not null)
        or
        (${table.status} <> 'closed' and ${table.closed_at} is null and ${table.closed_by} is null)
      )`,
    ),
    answeredStateCheck: check(
      'project_rfis_answered_state_consistent',
      sql`${table.status} <> 'answered' or (${table.response} is not null and ${table.responded_at} is not null and ${table.responded_by} is not null)`,
    ),
    projectTenantFk: foreignKey({
      name: 'project_rfis_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    requestedByTenantFk: foreignKey({
      name: 'project_rfis_requested_by_tenant_fk',
      columns: [table.tenant_id, table.requested_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    assignedToTenantFk: foreignKey({
      name: 'project_rfis_assigned_to_tenant_fk',
      columns: [table.tenant_id, table.assigned_to],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    respondedByTenantFk: foreignKey({
      name: 'project_rfis_responded_by_tenant_fk',
      columns: [table.tenant_id, table.responded_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    closedByTenantFk: foreignKey({
      name: 'project_rfis_closed_by_tenant_fk',
      columns: [table.tenant_id, table.closed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
  }),
)

export type ProjectRfi = typeof projectRfis.$inferSelect
export type ProjectRfiInsert = typeof projectRfis.$inferInsert
