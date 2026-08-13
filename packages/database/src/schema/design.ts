import { pgTable, uuid, varchar, text, integer, timestamp, boolean, index, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { opportunities } from './opportunities'
import { users } from './users'
import { documents } from './documents'

export const designFileTypeEnum = pgEnum('design_file_type', [
  'initial_layout',
  'final_rendering',
  'animation',
  'revised',
])

export const changeRequestPriorityEnum = pgEnum('change_request_priority', ['minor', 'major'])

// REFACTOR.md M2 US-008 — Design files uploaded for an Opportunity.
// Each design_files row is the "logical" file; versions are tracked by
// linked documents (storage objects).
export const designFiles = pgTable(
  'design_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
    file_type: designFileTypeEnum('file_type').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    is_ready_for_presentation: boolean('is_ready_for_presentation').notNull().default(false),
    is_client_approved: boolean('is_client_approved').notNull().default(false),
    client_approved_at: timestamp('client_approved_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_design_files_tenant_id').on(table.tenant_id),
    oppIdx: index('idx_design_files_opportunity_id').on(table.opportunity_id),
  })
)

export const designFileVersions = pgTable(
  'design_file_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    design_file_id: uuid('design_file_id').notNull().references(() => designFiles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    document_id: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    notes: text('notes'),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    uploaded_by: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    designFileIdx: index('idx_design_file_versions_design_file').on(table.design_file_id),
    tenantIdUniqueIdx: uniqueIndex('ux_design_file_versions_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
  })
)

// REFACTOR.md M2 US-009 — Change requests from the client.
export const changeRequests = pgTable(
  'change_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
    requested_by_name: varchar('requested_by_name', { length: 255 }),
    description: text('description').notNull(),
    priority: changeRequestPriorityEnum('priority').notNull().default('minor'),
    affected_design_file_id: uuid('affected_design_file_id').references(() => designFiles.id, { onDelete: 'set null' }),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    resolved_by: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('idx_change_requests_tenant_id').on(table.tenant_id),
    oppIdx: index('idx_change_requests_opportunity_id').on(table.opportunity_id),
    tenantIdUniqueIdx: uniqueIndex('ux_change_requests_tenant_id_id').on(table.tenant_id, table.id),
  })
)

export type DesignFile = typeof designFiles.$inferSelect
export type DesignFileInsert = typeof designFiles.$inferInsert
export type ChangeRequest = typeof changeRequests.$inferSelect
