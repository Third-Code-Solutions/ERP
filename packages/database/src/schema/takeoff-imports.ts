import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { tenants } from './tenants'
import { users } from './users'
import { projects } from './projects'
import { documents } from './documents'
import { boms } from './boms'
import { bomLineItems } from './bom-line-items'

export const boqDivisions = pgTable(
  'boq_divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    is_preliminaries: boolean('is_preliminaries').notNull().default(false),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('boq_divisions_tenant_id_id_unique').on(table.tenant_id, table.id),
    tenantCodeUniqueIdx: uniqueIndex('boq_divisions_tenant_code_unique').on(table.tenant_id, table.code),
    tenantIdx: index('boq_divisions_tenant_idx').on(table.tenant_id, table.sort_order),
    createdByTenantFk: foreignKey({
      name: 'boq_divisions_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    codeCheck: check('boq_divisions_code_nonempty', sql`${table.code} <> ''`),
    nameCheck: check('boq_divisions_name_nonempty', sql`${table.name} <> ''`),
  }),
)

export const drawingRevisions = pgTable(
  'drawing_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    project_id: uuid('project_id').notNull(),
    document_id: uuid('document_id'),
    source: text('source').notNull(),
    source_key: text('source_key').notNull(),
    label: text('label').notNull(),
    created_by: uuid('created_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('drawing_revisions_tenant_id_id_unique').on(table.tenant_id, table.id),
    sourceKeyUniqueIdx: uniqueIndex('drawing_revisions_source_key_unique').on(
      table.tenant_id,
      table.project_id,
      table.source,
      table.source_key,
    ),
    projectIdx: index('drawing_revisions_tenant_project_idx').on(table.tenant_id, table.project_id, table.updated_at),
    projectTenantFk: foreignKey({
      name: 'drawing_revisions_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    documentTenantFk: foreignKey({
      name: 'drawing_revisions_document_tenant_fk',
      columns: [table.tenant_id, table.document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'drawing_revisions_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const takeoffMappingProfiles = pgTable(
  'takeoff_mapping_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    name: text('name').notNull(),
    mapping: jsonb('mapping').$type<Record<string, string>>().notNull(),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('takeoff_mapping_profiles_tenant_id_id_unique').on(table.tenant_id, table.id),
    sourceNameUniqueIdx: uniqueIndex('takeoff_mapping_profiles_source_name_unique').on(table.tenant_id, table.source, table.name),
    tenantIdx: index('takeoff_mapping_profiles_tenant_idx').on(table.tenant_id, table.source),
    createdByTenantFk: foreignKey({
      name: 'takeoff_mapping_profiles_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'takeoff_mapping_profiles_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const takeoffImports = pgTable(
  'takeoff_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    bom_id: uuid('bom_id').notNull(),
    project_id: uuid('project_id').notNull(),
    drawing_revision_id: uuid('drawing_revision_id').notNull(),
    mapping_profile_id: uuid('mapping_profile_id'),
    source: text('source').notNull(),
    source_key: text('source_key').notNull(),
    file_name: text('file_name').notNull(),
    content_sha256: text('content_sha256').notNull(),
    status: text('status').notNull().default('committed'),
    row_count: integer('row_count').notNull().default(0),
    imported_count: integer('imported_count').notNull().default(0),
    unresolved_count: integer('unresolved_count').notNull().default(0),
    created_by: uuid('created_by'),
    updated_by: uuid('updated_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('takeoff_imports_tenant_id_id_unique').on(table.tenant_id, table.id),
    sourceKeyUniqueIdx: uniqueIndex('takeoff_imports_source_key_unique').on(table.tenant_id, table.bom_id, table.source, table.source_key),
    tenantBomIdx: index('takeoff_imports_tenant_bom_updated_idx').on(table.tenant_id, table.bom_id, table.updated_at),
    bomTenantFk: foreignKey({
      name: 'takeoff_imports_bom_tenant_fk',
      columns: [table.tenant_id, table.bom_id],
      foreignColumns: [boms.tenant_id, boms.id],
    }).onDelete('cascade'),
    projectTenantFk: foreignKey({
      name: 'takeoff_imports_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('cascade'),
    revisionTenantFk: foreignKey({
      name: 'takeoff_imports_revision_tenant_fk',
      columns: [table.tenant_id, table.drawing_revision_id],
      foreignColumns: [drawingRevisions.tenant_id, drawingRevisions.id],
    }).onDelete('restrict'),
    mappingProfileTenantFk: foreignKey({
      name: 'takeoff_imports_mapping_profile_tenant_fk',
      columns: [table.tenant_id, table.mapping_profile_id],
      foreignColumns: [takeoffMappingProfiles.tenant_id, takeoffMappingProfiles.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'takeoff_imports_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    updatedByTenantFk: foreignKey({
      name: 'takeoff_imports_updated_by_tenant_fk',
      columns: [table.tenant_id, table.updated_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export const takeoffUnresolvedItems = pgTable(
  'takeoff_unresolved_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    takeoff_import_id: uuid('takeoff_import_id').notNull(),
    bom_id: uuid('bom_id').notNull(),
    bom_line_item_id: uuid('bom_line_item_id'),
    source_row_key: text('source_row_key').notNull(),
    reason_code: text('reason_code').notNull(),
    reason: text('reason').notNull(),
    raw_payload: jsonb('raw_payload').$type<Record<string, string | number | null>>().notNull().default({}),
    status: text('status').notNull().default('pending'),
    created_by: uuid('created_by'),
    resolved_by: uuid('resolved_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex('takeoff_unresolved_items_tenant_id_id_unique').on(table.tenant_id, table.id),
    pendingKeyUniqueIdx: uniqueIndex('takeoff_unresolved_items_pending_key_unique').on(
      table.tenant_id,
      table.takeoff_import_id,
      table.source_row_key,
      table.reason_code,
    ),
    pendingIdx: index('takeoff_unresolved_items_pending_idx').on(table.tenant_id, table.bom_id, table.status, table.updated_at),
    importTenantFk: foreignKey({
      name: 'takeoff_unresolved_items_import_tenant_fk',
      columns: [table.tenant_id, table.takeoff_import_id],
      foreignColumns: [takeoffImports.tenant_id, takeoffImports.id],
    }).onDelete('cascade'),
    bomTenantFk: foreignKey({
      name: 'takeoff_unresolved_items_bom_tenant_fk',
      columns: [table.tenant_id, table.bom_id],
      foreignColumns: [boms.tenant_id, boms.id],
    }).onDelete('cascade'),
    lineTenantFk: foreignKey({
      name: 'takeoff_unresolved_items_line_tenant_fk',
      columns: [table.tenant_id, table.bom_id, table.bom_line_item_id],
      foreignColumns: [bomLineItems.tenant_id, bomLineItems.bom_id, bomLineItems.id],
    }).onDelete('cascade'),
    createdByTenantFk: foreignKey({
      name: 'takeoff_unresolved_items_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    resolvedByTenantFk: foreignKey({
      name: 'takeoff_unresolved_items_resolved_by_tenant_fk',
      columns: [table.tenant_id, table.resolved_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
  }),
)

export type BoqDivision = typeof boqDivisions.$inferSelect
export type DrawingRevision = typeof drawingRevisions.$inferSelect
export type TakeoffMappingProfile = typeof takeoffMappingProfiles.$inferSelect
export type TakeoffImport = typeof takeoffImports.$inferSelect
export type TakeoffUnresolvedItem = typeof takeoffUnresolvedItems.$inferSelect
