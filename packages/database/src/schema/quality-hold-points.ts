import { sql } from 'drizzle-orm'
import {
  boolean,
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
import { documents } from './documents'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

/** QA/QC hold point and inspection-work-request lifecycle. */
export const qualityHoldPointStatusEnum = pgEnum('quality_hold_point_status', [
  'planned',
  'ready',
  'submitted',
  'accepted',
  'rejected',
])

export const qualityHoldPoints = pgTable(
  'quality_hold_points',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    iwr_number: varchar('iwr_number', { length: 40 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    discipline: varchar('discipline', { length: 120 }).notNull().default(''),
    location: varchar('location', { length: 200 }).notNull().default(''),
    plan_reference: varchar('plan_reference', { length: 200 }).notNull().default(''),
    hold_point: boolean('hold_point').notNull().default(true),
    inspection_date: date('inspection_date', { mode: 'string' }),
    status: qualityHoldPointStatusEnum('status').notNull().default('planned'),
    request_notes: text('request_notes').notNull().default(''),
    findings: text('findings').notNull().default(''),
    rejection_reason: text('rejection_reason').notNull().default(''),
    acceptance_notes: text('acceptance_notes').notNull().default(''),
    requested_by: uuid('requested_by').notNull(),
    assigned_to: uuid('assigned_to'),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    submitted_by: uuid('submitted_by'),
    accepted_at: timestamp('accepted_at', { withTimezone: true }),
    accepted_by: uuid('accepted_by'),
    rejected_at: timestamp('rejected_at', { withTimezone: true }),
    rejected_by: uuid('rejected_by'),
    punchlist_handoff_at: timestamp('punchlist_handoff_at', { withTimezone: true }),
    punchlist_handoff_by: uuid('punchlist_handoff_by'),
    client_request_id: uuid('client_request_id').notNull(),
    version: integer('version').notNull().default(1),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_quality_hold_points_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    tenantProjectNumberUq: uniqueIndex('ux_quality_hold_points_tenant_project_number').on(
      table.tenant_id,
      table.project_id,
      table.iwr_number,
    ),
    tenantClientRequestUq: uniqueIndex('ux_quality_hold_points_tenant_client_request').on(
      table.tenant_id,
      table.client_request_id,
    ),
    projectStatusIdx: index('idx_quality_hold_points_project_status').on(
      table.tenant_id,
      table.project_id,
      table.status,
    ),
    assignedIdx: index('idx_quality_hold_points_assigned_status').on(
      table.tenant_id,
      table.assigned_to,
      table.status,
    ),
    titleNonempty: check(
      'quality_hold_points_title_nonempty',
      sql`${table.title} = btrim(${table.title}) and length(${table.title}) > 0`,
    ),
    descriptionNonempty: check(
      'quality_hold_points_description_nonempty',
      sql`${table.description} = btrim(${table.description}) and length(${table.description}) > 0`,
    ),
    versionPositive: check('quality_hold_points_version_positive', sql`${table.version} >= 1`),
    punchlistHandoffMetadataConsistent: check(
      'quality_hold_points_punchlist_handoff_metadata_consistent',
      sql`(
        (${table.punchlist_handoff_at} is null and ${table.punchlist_handoff_by} is null)
        or
        (${table.punchlist_handoff_at} is not null and ${table.punchlist_handoff_by} is not null)
      )`,
    ),
    lifecycleMetadataConsistent: check(
      'quality_hold_points_lifecycle_metadata_consistent',
      sql`(
        (${table.status} in ('planned', 'ready') and ${table.submitted_at} is null and ${table.submitted_by} is null and ${table.accepted_at} is null and ${table.accepted_by} is null and ${table.rejected_at} is null and ${table.rejected_by} is null)
        or
        (${table.status} = 'submitted' and ${table.submitted_at} is not null and ${table.submitted_by} is not null and ${table.accepted_at} is null and ${table.accepted_by} is null and ${table.rejected_at} is null and ${table.rejected_by} is null)
        or
        (${table.status} = 'accepted' and ${table.submitted_at} is not null and ${table.submitted_by} is not null and ${table.accepted_at} is not null and ${table.accepted_by} is not null and ${table.rejected_at} is null and ${table.rejected_by} is null)
        or
        (${table.status} = 'rejected' and ${table.submitted_at} is not null and ${table.submitted_by} is not null and ${table.accepted_at} is null and ${table.accepted_by} is null and ${table.rejected_at} is not null and ${table.rejected_by} is not null)
      )`,
    ),
    projectTenantFk: foreignKey({
      name: 'quality_hold_points_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    requestedByTenantFk: foreignKey({
      name: 'quality_hold_points_requested_by_tenant_fk',
      columns: [table.tenant_id, table.requested_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    assignedToTenantFk: foreignKey({
      name: 'quality_hold_points_assigned_to_tenant_fk',
      columns: [table.tenant_id, table.assigned_to],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    submittedByTenantFk: foreignKey({
      name: 'quality_hold_points_submitted_by_tenant_fk',
      columns: [table.tenant_id, table.submitted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    acceptedByTenantFk: foreignKey({
      name: 'quality_hold_points_accepted_by_tenant_fk',
      columns: [table.tenant_id, table.accepted_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    rejectedByTenantFk: foreignKey({
      name: 'quality_hold_points_rejected_by_tenant_fk',
      columns: [table.tenant_id, table.rejected_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    punchlistHandoffByTenantFk: foreignKey({
      name: 'quality_hold_points_punchlist_handoff_by_tenant_fk',
      columns: [table.tenant_id, table.punchlist_handoff_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export type QualityHoldPoint = typeof qualityHoldPoints.$inferSelect
export type QualityHoldPointInsert = typeof qualityHoldPoints.$inferInsert

/** Immutable operation record for turning one rejected IWR into punchlist work. */
export const qualityHoldPointPunchlistHandoffs = pgTable(
  'quality_hold_point_punchlist_handoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    quality_hold_point_id: uuid('quality_hold_point_id').notNull(),
    client_request_id: uuid('client_request_id').notNull(),
    request_hash: varchar('request_hash', { length: 64 }).notNull(),
    source_iwr_number: varchar('source_iwr_number', { length: 40 }).notNull(),
    source_findings: text('source_findings').notNull().default(''),
    source_rejection_reason: text('source_rejection_reason').notNull(),
    plan_document_id: uuid('plan_document_id'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_quality_hold_point_punchlist_handoffs_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    tenantSourceUq: uniqueIndex('ux_quality_hold_point_punchlist_handoffs_tenant_source').on(
      table.tenant_id,
      table.quality_hold_point_id,
    ),
    tenantClientRequestUq: uniqueIndex('ux_quality_hold_point_punchlist_handoffs_tenant_client_request').on(
      table.tenant_id,
      table.client_request_id,
    ),
    tenantProjectIdUniqueIdx: uniqueIndex('ux_quality_hold_point_punchlist_handoffs_tenant_id_project_id').on(
      table.tenant_id,
      table.id,
      table.project_id,
    ),
    projectIdx: index('idx_quality_hold_point_punchlist_handoffs_project').on(
      table.tenant_id,
      table.project_id,
      table.created_at,
    ),
    sourceIdx: index('idx_quality_hold_point_punchlist_handoffs_source').on(
      table.tenant_id,
      table.quality_hold_point_id,
    ),
    projectTenantFk: foreignKey({
      name: 'quality_hold_point_punchlist_handoffs_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    sourceQualityHoldPointTenantFk: foreignKey({
      name: 'quality_hold_point_punchlist_handoffs_source_quality_tenant_fk',
      columns: [table.tenant_id, table.quality_hold_point_id],
      foreignColumns: [qualityHoldPoints.tenant_id, qualityHoldPoints.id],
    }).onDelete('restrict'),
    planDocumentTenantFk: foreignKey({
      name: 'quality_hold_point_punchlist_handoffs_plan_document_tenant_fk',
      columns: [table.tenant_id, table.plan_document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('no action'),
    createdByTenantFk: foreignKey({
      name: 'quality_hold_point_punchlist_handoffs_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    requestHashLength: check(
      'quality_hold_point_punchlist_handoffs_request_hash_length',
      sql`length(${table.request_hash}) = 64`,
    ),
    sourceIwrNumberNonempty: check(
      'quality_hold_point_punchlist_handoffs_source_iwr_number_nonempty',
      sql`${table.source_iwr_number} = btrim(${table.source_iwr_number}) and length(${table.source_iwr_number}) > 0`,
    ),
    sourceRejectionReasonNonempty: check(
      'quality_hold_point_punchlist_handoffs_source_rejection_reason_nonempty',
      sql`${table.source_rejection_reason} = btrim(${table.source_rejection_reason}) and length(${table.source_rejection_reason}) > 0`,
    ),
  }),
)

export type QualityHoldPointPunchlistHandoff = typeof qualityHoldPointPunchlistHandoffs.$inferSelect
export type QualityHoldPointPunchlistHandoffInsert = typeof qualityHoldPointPunchlistHandoffs.$inferInsert
