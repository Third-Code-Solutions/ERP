import { sql } from 'drizzle-orm'
import {
  boolean,
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
import { tenants } from './tenants'
import { projects } from './projects'
import { boms } from './boms'
import { documents } from './documents'
import { users } from './users'

// REFACTOR.md M4 US-Pre-001 — Pre-Construction checklist auto-generated
// on project creation. Each project has exactly one checklist.
export const preConChecklistTemplates = pgTable(
  'pre_con_checklist_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull().default('default'),
    // [{title, owner_role, sla_days, depends_on_index, requires_attachment}]
    items: text('items').notNull(), // JSON-encoded array; jsonb would also work
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_pcc_templates_tenant_id').on(table.tenant_id),
  })
)

export const checklistItemStatusEnum = pgEnum('checklist_item_status', [
  'not_started',
  'in_progress',
  'blocked',
  'done',
])

export const preConChecklists = pgTable(
  'pre_con_checklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    template_id: uuid('template_id').references(() => preConChecklistTemplates.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_pre_con_checklists_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_pre_con_checklists_project_id').on(table.project_id),
  })
)

export const preConChecklistItems = pgTable(
  'pre_con_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    checklist_id: uuid('checklist_id').notNull().references(() => preConChecklists.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    owner_role: varchar('owner_role', { length: 64 }),
    sla_days: integer('sla_days'),
    status: checklistItemStatusEnum('status').notNull().default('not_started'),
    blocker_reason: text('blocker_reason'),
    depends_on_item_id: uuid('depends_on_item_id'),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    completed_by: uuid('completed_by').references(() => users.id, { onDelete: 'set null' }),
    sla_clock_started_at: timestamp('sla_clock_started_at', { withTimezone: true }),
    sla_breached_at: timestamp('sla_breached_at', { withTimezone: true }),
    attachment_document_id: uuid('attachment_document_id').references(() => documents.id, { onDelete: 'set null' }),
    sort_order: integer('sort_order').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    checklistIdx: index('idx_pcc_items_checklist_id').on(table.checklist_id),
    tenantStatusIdx: index('idx_pcc_items_tenant_status').on(table.tenant_id, table.status),
  })
)

// REFACTOR.md M4 US-Pre-002 — Permit tracker.
export const permitTypeEnum = pgEnum('permit_type', [
  'building_admin_vetting',
  'lgu_building_permit',
  'dole_permit',
  'occupancy_permit',
  'cari',
  'performance_bond',
  'surety_bond',
  'construction_bond',
])

export const permitStatusEnum = pgEnum('permit_status', [
  'not_started',
  'submitted',
  'additional_docs_required',
  'under_review',
  'approved',
  'rejected',
  'released',
  'refunded',
  'cancelled',
])

/**
 * Tenant-maintained duration baseline for an external return. The permit
 * stores a snapshot so later profile edits never rewrite historical risk.
 */
export const permitDurationProfiles = pgTable(
  'permit_duration_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    lgu_name: varchar('lgu_name', { length: 160 }).notNull(),
    permit_type: permitTypeEnum('permit_type').notNull(),
    min_duration_days: integer('min_duration_days').notNull(),
    expected_duration_days: integer('expected_duration_days').notNull(),
    max_duration_days: integer('max_duration_days').notNull(),
    observed_count: integer('observed_count').notNull().default(0),
    last_observed_days: integer('last_observed_days'),
    last_observed_at: timestamp('last_observed_at', { withTimezone: true }),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_permit_duration_profiles_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    identityUniqueIdx: uniqueIndex('ux_permit_duration_profiles_identity').on(
      table.tenant_id,
      table.lgu_name,
      table.permit_type
    ),
    tenantLguIdx: index('idx_permit_duration_profiles_tenant_lgu').on(
      table.tenant_id,
      table.lgu_name
    ),
    durationRangeCheck: check(
      'permit_duration_profiles_range',
      sql`${table.min_duration_days} >= 0 and ${table.min_duration_days} <= ${table.expected_duration_days} and ${table.expected_duration_days} <= ${table.max_duration_days}`
    ),
    observedCountCheck: check(
      'permit_duration_profiles_observed_count',
      sql`${table.observed_count} >= 0 and (${table.observed_count} = 0 or ${table.last_observed_days} is not null)`
    ),
    lguNameCheck: check(
      'permit_duration_profiles_lgu_name_nonempty',
      sql`${table.lgu_name} = btrim(${table.lgu_name}) and length(${table.lgu_name}) > 0`
    ),
    createdByTenantFk: foreignKey({
      name: 'permit_duration_profiles_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'permit_duration_profiles_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  })
)

export const permits = pgTable(
  'permits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    permit_type: permitTypeEnum('permit_type').notNull(),
    status: permitStatusEnum('status').notNull().default('not_started'),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    expected_approval_at: timestamp('expected_approval_at', { withTimezone: true }),
    expected_return_at: timestamp('expected_return_at', { withTimezone: true }),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    actual_return_at: timestamp('actual_return_at', { withTimezone: true }),
    refunded_at: timestamp('refunded_at', { withTimezone: true }),
    lgu_name: varchar('lgu_name', { length: 160 }),
    responsible_user_id: uuid('responsible_user_id'),
    duration_profile_id: uuid('duration_profile_id'),
    min_duration_days: integer('min_duration_days'),
    expected_duration_days: integer('expected_duration_days'),
    max_duration_days: integer('max_duration_days'),
    escalation_at: timestamp('escalation_at', { withTimezone: true }),
    escalated_at: timestamp('escalated_at', { withTimezone: true }),
    escalation_reason: varchar('escalation_reason', { length: 500 }),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    last_status_change_at: timestamp('last_status_change_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_permits_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_permits_project_id').on(table.project_id),
    tenantStatusIdx: index('idx_permits_tenant_status').on(table.tenant_id, table.status),
    tenantIdUniqueIdx: uniqueIndex('ux_permits_tenant_id_id').on(table.tenant_id, table.id),
    responsibleIdx: index('idx_permits_tenant_responsible').on(
      table.tenant_id,
      table.responsible_user_id
    ),
    expectedReturnIdx: index('idx_permits_tenant_expected_return').on(
      table.tenant_id,
      table.expected_return_at
    ),
    durationRangeCheck: check(
      'permits_duration_range',
      sql`(
        ${table.min_duration_days} is null
        and ${table.expected_duration_days} is null
        and ${table.max_duration_days} is null
      ) or (
        ${table.min_duration_days} is not null
        and ${table.expected_duration_days} is not null
        and ${table.max_duration_days} is not null
        and ${table.min_duration_days} >= 0
        and ${table.min_duration_days} <= ${table.expected_duration_days}
        and ${table.expected_duration_days} <= ${table.max_duration_days}
      )`
    ),
    escalationCheck: check(
      'permits_escalation_reason',
      sql`${table.escalated_at} is null or (${table.escalation_reason} is not null and length(btrim(${table.escalation_reason})) > 0)`
    ),
    projectTenantFk: foreignKey({
      name: 'permits_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    responsibleUserTenantFk: foreignKey({
      name: 'permits_responsible_user_tenant_fk',
      columns: [table.tenant_id, table.responsible_user_id],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    durationProfileTenantFk: foreignKey({
      name: 'permits_duration_profile_tenant_fk',
      columns: [table.tenant_id, table.duration_profile_id],
      foreignColumns: [permitDurationProfiles.tenant_id, permitDurationProfiles.id],
    }).onDelete('set null'),
    createdByTenantFk: foreignKey({
      name: 'permits_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    updatedByTenantFk: foreignKey({
      name: 'permits_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
  })
)

/**
 * One readiness ledger per project. The database check is the final guard:
 * application code may explain and audit an override, but it cannot bypass
 * the requirement that every missing return has a recorded reason and actor.
 */
export const mobilizationReadiness = pgTable(
  'mobilization_readiness',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    commented_fcd_received_at: timestamp('commented_fcd_received_at', { withTimezone: true }),
    po_copies_received_at: timestamp('po_copies_received_at', { withTimezone: true }),
    cari_received_at: timestamp('cari_received_at', { withTimezone: true }),
    ntp_received_at: timestamp('ntp_received_at', { withTimezone: true }),
    started_at: timestamp('started_at', { withTimezone: true }),
    started_by: uuid('started_by'),
    override_reason: varchar('override_reason', { length: 500 }),
    override_at: timestamp('override_at', { withTimezone: true }),
    override_by: uuid('override_by'),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_mobilization_readiness_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
    projectUniqueIdx: uniqueIndex('ux_mobilization_readiness_tenant_project').on(
      table.tenant_id,
      table.project_id
    ),
    projectIdx: index('idx_mobilization_readiness_project').on(
      table.tenant_id,
      table.project_id
    ),
    startedIdx: index('idx_mobilization_readiness_started').on(
      table.tenant_id,
      table.started_at
    ),
    startActorCheck: check(
      'mobilization_readiness_start_actor',
      sql`(${table.started_at} is null and ${table.started_by} is null) or (${table.started_at} is not null and ${table.started_by} is not null)`
    ),
    overrideCheck: check(
      'mobilization_readiness_override',
      sql`(
        ${table.override_reason} is null
        and ${table.override_at} is null
        and ${table.override_by} is null
      ) or (
        ${table.started_at} is not null
        and ${table.override_reason} is not null
        and length(btrim(${table.override_reason})) > 0
        and ${table.override_at} is not null
        and ${table.override_by} is not null
      )`
    ),
    startGateCheck: check(
      'mobilization_readiness_start_gate',
      sql`${table.started_at} is null or (
        (${table.commented_fcd_received_at} is not null
          and ${table.po_copies_received_at} is not null
          and ${table.cari_received_at} is not null
          and ${table.ntp_received_at} is not null)
        or ${table.override_reason} is not null
      )`
    ),
    projectTenantFk: foreignKey({
      name: 'mobilization_readiness_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    startedByTenantFk: foreignKey({
      name: 'mobilization_readiness_started_by_tenant_fk',
      columns: [table.tenant_id, table.started_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    overrideByTenantFk: foreignKey({
      name: 'mobilization_readiness_override_by_tenant_fk',
      columns: [table.tenant_id, table.override_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'mobilization_readiness_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
    updatedByTenantFk: foreignKey({
      name: 'mobilization_readiness_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('set null'),
  })
)

export const permitDocuments = pgTable(
  'permit_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    permit_id: uuid('permit_id').notNull().references(() => permits.id, { onDelete: 'cascade' }),
    document_id: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    note: varchar('note', { length: 255 }),
    submission_round: integer('submission_round').notNull().default(1),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    permitIdx: index('idx_permit_documents_permit_id').on(table.permit_id),
  })
)

// REFACTOR.md M4 — Contract module per Sprint 6.
export const contractStatusEnum = pgEnum('contract_status', [
  'draft',
  'pending_signature',
  'signed',
  'cancelled',
])

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    bom_id: uuid('bom_id').references(() => boms.id, { onDelete: 'set null' }),
    status: contractStatusEnum('status').notNull().default('draft'),
    docuseal_submission_id: varchar('docuseal_submission_id', { length: 128 }),
    docuseal_slug: varchar('docuseal_slug', { length: 128 }),
    signed_document_id: uuid('signed_document_id').references(() => documents.id, { onDelete: 'set null' }),
    signed_at: timestamp('signed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_contracts_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_contracts_project_id').on(table.project_id),
  })
)

export type PreConChecklist = typeof preConChecklists.$inferSelect
export type PreConChecklistItem = typeof preConChecklistItems.$inferSelect
export type PermitDurationProfile = typeof permitDurationProfiles.$inferSelect
export type Permit = typeof permits.$inferSelect
export type MobilizationReadiness = typeof mobilizationReadiness.$inferSelect
export type Contract = typeof contracts.$inferSelect
