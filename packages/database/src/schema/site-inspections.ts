import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { opportunities } from './opportunities'
import { users } from './users'
import { documents } from './documents'

export const inspectionStatusEnum = pgEnum('inspection_status', [
  'draft',
  'submitted',
  'archived',
])

export const rfiPriorityEnum = pgEnum('rfi_priority', ['minor', 'major'])

// REFACTOR.md M2 US-007 — Site Inspection Report.
export const siteInspections = pgTable(
  'site_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
    // Stable client token makes offline reconnect and browser double-submit
    // retries safe without weakening the tenant boundary.
    client_submission_id: uuid('client_submission_id'),
    status: inspectionStatusEnum('status').notNull().default('draft'),
    payload: jsonb('payload').notNull(),
    pdf_document_id: uuid('pdf_document_id').references(() => documents.id, { onDelete: 'set null' }),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    submitted_by: uuid('submitted_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_site_inspections_tenant_id_id').on(table.tenant_id, table.id),
    clientSubmissionIdx: uniqueIndex('ux_site_inspections_tenant_submission')
      .on(table.tenant_id, table.client_submission_id)
      .where(sql`${table.client_submission_id} is not null`),
    tenantIdx: index('idx_site_inspections_tenant_id').on(table.tenant_id),
    oppIdx: index('idx_site_inspections_opportunity_id').on(table.opportunity_id),
    opportunityTenantFk: foreignKey({
      name: 'site_inspections_opportunity_tenant_fk',
      columns: [table.tenant_id, table.opportunity_id],
      foreignColumns: [opportunities.tenant_id, opportunities.id],
    }).onDelete('cascade'),
    pdfDocumentTenantFk: foreignKey({
      name: 'site_inspections_pdf_document_tenant_fk',
      columns: [table.tenant_id, table.pdf_document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('set null'),
  })
)

export const siteInspectionPhotos = pgTable(
  'site_inspection_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    inspection_id: uuid('inspection_id').notNull().references(() => siteInspections.id, { onDelete: 'cascade' }),
    document_id: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    caption: varchar('caption', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    inspectionIdx: index('idx_site_inspection_photos_inspection').on(table.inspection_id),
    inspectionTenantFk: foreignKey({
      name: 'site_inspection_photos_inspection_tenant_fk',
      columns: [table.tenant_id, table.inspection_id],
      foreignColumns: [siteInspections.tenant_id, siteInspections.id],
    }).onDelete('cascade'),
    documentTenantFk: foreignKey({
      name: 'site_inspection_photos_document_tenant_fk',
      columns: [table.tenant_id, table.document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('cascade'),
  })
)

export const siteInspectionRfis = pgTable(
  'site_inspection_rfis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    inspection_id: uuid('inspection_id').notNull().references(() => siteInspections.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    priority: rfiPriorityEnum('priority').notNull().default('minor'),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    resolved_by: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    inspectionIdx: index('idx_site_inspection_rfis_inspection').on(table.inspection_id),
    inspectionTenantFk: foreignKey({
      name: 'site_inspection_rfis_inspection_tenant_fk',
      columns: [table.tenant_id, table.inspection_id],
      foreignColumns: [siteInspections.tenant_id, siteInspections.id],
    }).onDelete('cascade'),
  })
)

export type SiteInspection = typeof siteInspections.$inferSelect
export type SiteInspectionInsert = typeof siteInspections.$inferInsert
