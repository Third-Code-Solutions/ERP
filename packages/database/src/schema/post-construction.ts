import { pgTable, uuid, varchar, text, timestamp, boolean, index, pgEnum } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'
import { documents } from './documents'

// REFACTOR.md M6 US-Post-001 — Punchlist items.
export const punchlistStatusEnum = pgEnum('punchlist_status', [
  'open',
  'in_progress',
  'for_inspection',
  'closed',
])

export const punchlistPriorityEnum = pgEnum('punchlist_priority', [
  'low',
  'medium',
  'high',
  'critical',
])

export const punchlistItems = pgTable(
  'punchlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    location: varchar('location', { length: 255 }),
    trade: varchar('trade', { length: 120 }),
    priority: punchlistPriorityEnum('priority').notNull().default('medium'),
    status: punchlistStatusEnum('status').notNull().default('open'),
    due_date: timestamp('due_date', { withTimezone: true }),
    assigned_to_user_id: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    assigned_to_text: varchar('assigned_to_text', { length: 255 }), // e.g. subcon name
    pe_signed_off_at: timestamp('pe_signed_off_at', { withTimezone: true }),
    pe_signed_off_by: uuid('pe_signed_off_by').references(() => users.id, { onDelete: 'set null' }),
    closed_at: timestamp('closed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    tenantIdx: index('idx_punchlist_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_punchlist_project_id').on(table.project_id),
    tenantStatusIdx: index('idx_punchlist_tenant_status').on(table.tenant_id, table.status),
    projectTradeIdx: index('idx_punchlist_project_trade').on(table.project_id, table.trade),
  })
)

export const punchlistPhotos = pgTable(
  'punchlist_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    punchlist_item_id: uuid('punchlist_item_id').notNull().references(() => punchlistItems.id, { onDelete: 'cascade' }),
    document_id: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    caption: varchar('caption', { length: 255 }),
    is_before: boolean('is_before').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    punchlistIdx: index('idx_punchlist_photos_item').on(table.punchlist_item_id),
  })
)

// REFACTOR.md M6 US-Post-002 — Turnover Package + COC.
export const turnoverPackages = pgTable(
  'turnover_packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    as_built_document_id: uuid('as_built_document_id').references(() => documents.id, { onDelete: 'set null' }),
    om_manual_document_id: uuid('om_manual_document_id').references(() => documents.id, { onDelete: 'set null' }),
    warranty_cert_document_id: uuid('warranty_cert_document_id').references(() => documents.id, { onDelete: 'set null' }),
    keys_log_document_id: uuid('keys_log_document_id').references(() => documents.id, { onDelete: 'set null' }),
    compiled_at: timestamp('compiled_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_turnover_project_id').on(table.project_id),
  })
)

export const cocStatusEnum = pgEnum('coc_status', [
  'draft',
  'pending_signature',
  'signed',
])

export const certificatesOfCompletion = pgTable(
  'certificates_of_completion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    status: cocStatusEnum('status').notNull().default('draft'),
    docuseal_submission_id: varchar('docuseal_submission_id', { length: 128 }),
    signed_document_id: uuid('signed_document_id').references(() => documents.id, { onDelete: 'set null' }),
    signed_at: timestamp('signed_at', { withTimezone: true }),
    warranty_period_starts_at: timestamp('warranty_period_starts_at', { withTimezone: true }),
    warranty_period_ends_at: timestamp('warranty_period_ends_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('idx_coc_project_id').on(table.project_id),
  })
)

export type PunchlistItem = typeof punchlistItems.$inferSelect
export type TurnoverPackage = typeof turnoverPackages.$inferSelect
export type CertificateOfCompletion = typeof certificatesOfCompletion.$inferSelect
