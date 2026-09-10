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

export const projectSubmittalStatusEnum = pgEnum('project_submittal_status', [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
])

/** Tenant-safe document-control register; binary objects stay in Documents. */
export const projectSubmittals = pgTable(
  'project_submittals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    submittal_number: varchar('submittal_number', { length: 40 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    spec_section: varchar('spec_section', { length: 120 }).notNull().default(''),
    discipline: varchar('discipline', { length: 120 }).notNull().default(''),
    plan_reference: varchar('plan_reference', { length: 200 }).notNull().default(''),
    due_date: date('due_date', { mode: 'string' }),
    status: projectSubmittalStatusEnum('status').notNull().default('draft'),
    submission_notes: text('submission_notes').notNull().default(''),
    review_notes: text('review_notes').notNull().default(''),
    rejection_reason: text('rejection_reason').notNull().default(''),
    requested_by: uuid('requested_by').notNull(),
    assigned_to: uuid('assigned_to'),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    submitted_by: uuid('submitted_by'),
    review_started_at: timestamp('review_started_at', { withTimezone: true }),
    review_started_by: uuid('review_started_by'),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    reviewed_by: uuid('reviewed_by'),
    client_request_id: uuid('client_request_id').notNull(),
    version: integer('version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_project_submittals_tenant_id_id').on(table.tenant_id, table.id),
    tenantProjectNumberUq: uniqueIndex('ux_project_submittals_tenant_project_number').on(
      table.tenant_id,
      table.project_id,
      table.submittal_number,
    ),
    tenantClientRequestUq: uniqueIndex('ux_project_submittals_tenant_client_request').on(
      table.tenant_id,
      table.client_request_id,
    ),
    projectStatusIdx: index('idx_project_submittals_project_status').on(
      table.tenant_id,
      table.project_id,
      table.status,
    ),
    assignedDueIdx: index('idx_project_submittals_assigned_due').on(
      table.tenant_id,
      table.assigned_to,
      table.due_date,
    ),
    titleNonempty: check(
      'project_submittals_title_nonempty',
      sql`${table.title} = btrim(${table.title}) and length(${table.title}) > 0`,
    ),
    descriptionNonempty: check(
      'project_submittals_description_nonempty',
      sql`${table.description} = btrim(${table.description}) and length(${table.description}) > 0`,
    ),
    versionPositive: check('project_submittals_version_positive', sql`${table.version} >= 1`),
    lifecycleMetadataConsistent: check(
      'project_submittals_lifecycle_metadata_consistent',
      sql`(
        (${table.status} = 'draft' and ${table.submitted_at} is null and ${table.submitted_by} is null and ${table.review_started_at} is null and ${table.review_started_by} is null and ${table.reviewed_at} is null and ${table.reviewed_by} is null)
        or
        (${table.status} = 'submitted' and ${table.submitted_at} is not null and ${table.submitted_by} is not null and ${table.review_started_at} is null and ${table.review_started_by} is null and ${table.reviewed_at} is null and ${table.reviewed_by} is null)
        or
        (${table.status} = 'under_review' and ${table.submitted_at} is not null and ${table.submitted_by} is not null and ${table.review_started_at} is not null and ${table.review_started_by} is not null and ${table.reviewed_at} is null and ${table.reviewed_by} is null)
        or
        (${table.status} = 'approved' and ${table.submitted_at} is not null and ${table.submitted_by} is not null and ${table.review_started_at} is not null and ${table.review_started_by} is not null and ${table.reviewed_at} is not null and ${table.reviewed_by} is not null and ${table.rejection_reason} = '')
        or
        (${table.status} = 'rejected' and ${table.submitted_at} is not null and ${table.submitted_by} is not null and ${table.review_started_at} is not null and ${table.review_started_by} is not null and ${table.reviewed_at} is not null and ${table.reviewed_by} is not null and length(btrim(${table.rejection_reason})) > 0)
      )`,
    ),
    projectTenantFk: foreignKey({
      name: 'project_submittals_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    requestedByTenantFk: foreignKey({
      name: 'project_submittals_requested_by_tenant_fk',
      columns: [table.tenant_id, table.requested_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    assignedToTenantFk: foreignKey({
      name: 'project_submittals_assigned_to_tenant_fk',
      columns: [table.tenant_id, table.assigned_to],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    submittedByTenantFk: foreignKey({
      name: 'project_submittals_submitted_by_tenant_fk',
      columns: [table.tenant_id, table.submitted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    reviewStartedByTenantFk: foreignKey({
      name: 'project_submittals_review_started_by_tenant_fk',
      columns: [table.tenant_id, table.review_started_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    reviewedByTenantFk: foreignKey({
      name: 'project_submittals_reviewed_by_tenant_fk',
      columns: [table.tenant_id, table.reviewed_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
  }),
)

export type ProjectSubmittal = typeof projectSubmittals.$inferSelect
export type ProjectSubmittalInsert = typeof projectSubmittals.$inferInsert
