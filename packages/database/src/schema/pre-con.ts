import { pgTable, uuid, varchar, text, integer, timestamp, boolean, index, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core'
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
    tenantIdUniqueIdx: uniqueIndex('ux_pre_con_checklists_tenant_id_id').on(
      table.tenant_id,
      table.id
    ),
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
])

export const permitStatusEnum = pgEnum('permit_status', [
  'not_started',
  'submitted',
  'additional_docs_required',
  'under_review',
  'approved',
  'rejected',
])

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
    approved_at: timestamp('approved_at', { withTimezone: true }),
    last_status_change_at: timestamp('last_status_change_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_permits_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_permits_project_id').on(table.project_id),
    tenantStatusIdx: index('idx_permits_tenant_status').on(table.tenant_id, table.status),
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
export type Permit = typeof permits.$inferSelect
export type Contract = typeof contracts.$inferSelect
