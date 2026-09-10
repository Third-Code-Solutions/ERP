import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { projectSubmittals } from './project-submittals'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const projectSubmittalDocumentRoleEnum = pgEnum(
  'project_submittal_document_role',
  ['submission', 'plan', 'response'],
)

/**
 * CDE relationship metadata. The binary object remains owned by documents;
 * this table only records which submittal role the project document fulfils.
 */
export const projectSubmittalDocuments = pgTable(
  'project_submittal_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    submittal_id: uuid('submittal_id').notNull(),
    document_id: uuid('document_id').notNull(),
    role: projectSubmittalDocumentRoleEnum('role').notNull(),
    caption: varchar('caption', { length: 255 }).notNull().default(''),
    linked_by: uuid('linked_by').notNull(),
    client_request_id: uuid('client_request_id').notNull(),
    request_hash: varchar('request_hash', { length: 64 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('ux_project_submittal_documents_tenant_id_id').on(
      table.tenant_id,
      table.id,
    ),
    tenantSubmittalDocumentRoleUq: uniqueIndex(
      'ux_project_submittal_documents_tenant_submittal_document_role',
    ).on(table.tenant_id, table.submittal_id, table.document_id, table.role),
    tenantClientRequestUq: uniqueIndex(
      'ux_project_submittal_documents_tenant_client_request',
    ).on(table.tenant_id, table.client_request_id),
    projectSubmittalIdx: index('idx_project_submittal_documents_submittal').on(
      table.tenant_id,
      table.project_id,
      table.submittal_id,
      table.created_at,
    ),
    projectDocumentIdx: index('idx_project_submittal_documents_document').on(
      table.tenant_id,
      table.project_id,
      table.document_id,
    ),
    captionLength: check(
      'project_submittal_documents_caption_length',
      sql`length(${table.caption}) <= 255`,
    ),
    requestHashLength: check(
      'project_submittal_documents_request_hash_length',
      sql`length(${table.request_hash}) = 64`,
    ),
    projectTenantFk: foreignKey({
      name: 'project_submittal_documents_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    submittalTenantFk: foreignKey({
      name: 'project_submittal_documents_submittal_tenant_fk',
      columns: [table.tenant_id, table.submittal_id],
      foreignColumns: [projectSubmittals.tenant_id, projectSubmittals.id],
    }).onDelete('cascade'),
    documentTenantFk: foreignKey({
      name: 'project_submittal_documents_document_tenant_fk',
      columns: [table.tenant_id, table.document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('cascade'),
    linkedByTenantFk: foreignKey({
      name: 'project_submittal_documents_linked_by_tenant_fk',
      columns: [table.tenant_id, table.linked_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export type ProjectSubmittalDocument = typeof projectSubmittalDocuments.$inferSelect
export type ProjectSubmittalDocumentInsert = typeof projectSubmittalDocuments.$inferInsert
