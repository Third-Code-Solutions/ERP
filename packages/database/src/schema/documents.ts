import { pgTable, uuid, varchar, text, bigint, timestamp, index } from 'drizzle-orm/pg-core'
import { documentTypeEnum } from './enums'
import { tenants } from './tenants'
import { projects } from './projects'
import { users } from './users'

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
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
    tenantIdx: index('idx_documents_tenant_id').on(table.tenant_id),
    projectIdx: index('idx_documents_project_id').on(table.project_id),
    uploadedByIdx: index('idx_documents_uploaded_by').on(table.uploaded_by),
    tenantTypeIdx: index('idx_documents_tenant_type').on(table.tenant_id, table.document_type),
  })
)

export type Document = typeof documents.$inferSelect
export type DocumentInsert = typeof documents.$inferInsert
