import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { documentTypeEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'
import { opportunities } from './opportunities'

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    // A document belongs to an existing project or a pre-Won opportunity.
    // Site-inspection photos are captured before project conversion.
    project_id: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    opportunity_id: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'cascade' }),
    uploaded_by: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    document_type: documentTypeEnum('document_type').notNull(),
    file_name: varchar('file_name', { length: 255 }).notNull(),
    storage_path: text('storage_path').notNull(),
    mime_type: varchar('mime_type', { length: 127 }).notNull(),
    size_bytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    description: text('description'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_documents_tenant_id_id').on(table.tenant_id, table.id),
    tenantProjectIdUniqueIdx: uniqueIndex('ux_documents_tenant_project_id').on(
      table.tenant_id,
      table.project_id,
      table.id,
    ),
    tenantIdx: index('idx_documents_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_documents_project_id').on(table.project_id),
    uploadedByIdx: index('idx_documents_uploaded_by').on(table.uploaded_by),
    tenantTypeIdx: index('idx_documents_tenant_type').on(table.tenant_id, table.document_type),
    opportunityIdx: index('idx_documents_opportunity_id').on(table.opportunity_id),
    opportunityTenantFk: foreignKey({
      name: 'documents_opportunity_tenant_fk',
      columns: [table.tenant_id, table.opportunity_id],
      foreignColumns: [opportunities.tenant_id, opportunities.id],
    }).onDelete('cascade'),
    parentCheck: check(
      'documents_project_or_opportunity',
      sql`${table.project_id} is not null or ${table.opportunity_id} is not null`
    ),
  })
)

export type Document = typeof documents.$inferSelect
export type DocumentInsert = typeof documents.$inferInsert
