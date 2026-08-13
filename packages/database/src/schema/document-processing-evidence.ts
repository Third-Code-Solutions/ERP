import { sql } from 'drizzle-orm'
import {
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { documentProcessingFileFormatEnum } from './enums'
import { documentProcessingJobs } from './document-processing-jobs'
import { documents } from './documents'
import { projects } from './projects'
import { tenants } from './tenants'

/**
 * Immutable, tenant-scoped evidence returned by one processing attempt.
 * Signed URLs and worker authority never enter this payload.
 */
export const documentProcessingEvidence = pgTable(
  'document_processing_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    job_id: uuid('job_id').notNull(),
    document_id: uuid('document_id').notNull(),
    project_id: uuid('project_id').notNull(),
    attempt: integer('attempt').notNull(),
    source_sha256: char('source_sha256', { length: 64 }).notNull(),
    producer_name: varchar('producer_name', { length: 100 }).notNull(),
    producer_version: varchar('producer_version', { length: 100 }).notNull(),
    source_format: documentProcessingFileFormatEnum('source_format').notNull(),
    parsed_format: documentProcessingFileFormatEnum('parsed_format').notNull(),
    item_count: integer('item_count').notNull(),
    warnings: jsonb('warnings').notNull().default([]),
    payload: jsonb('payload').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_document_processing_evidence_tenant_id_id'
    ).on(table.tenant_id, table.id),
    jobAttemptUniqueIdx: uniqueIndex(
      'ux_document_processing_evidence_tenant_job_attempt'
    ).on(table.tenant_id, table.job_id, table.attempt),
    tenantJobIdx: index('idx_document_processing_evidence_tenant_job').on(
      table.tenant_id,
      table.job_id,
      table.attempt
    ),
    jobTenantFk: foreignKey({
      name: 'document_processing_evidence_job_tenant_fk',
      columns: [table.tenant_id, table.job_id],
      foreignColumns: [documentProcessingJobs.tenant_id, documentProcessingJobs.id],
    }).onDelete('cascade'),
    documentTenantFk: foreignKey({
      name: 'document_processing_evidence_document_tenant_fk',
      columns: [table.tenant_id, table.document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'document_processing_evidence_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    attemptCheck: check(
      'document_processing_evidence_attempt_range',
      sql`${table.attempt} between 1 and 5`
    ),
    sourceHashCheck: check(
      'document_processing_evidence_source_hash_hex',
      sql`${table.source_sha256} ~ '^[0-9a-f]{64}$'`
    ),
    producerNameCheck: check(
      'document_processing_evidence_producer_name_bounded',
      sql`length(btrim(${table.producer_name})) between 1 and 100`
    ),
    producerVersionCheck: check(
      'document_processing_evidence_producer_version_bounded',
      sql`length(btrim(${table.producer_version})) between 1 and 100`
    ),
    itemCountCheck: check(
      'document_processing_evidence_item_count_range',
      sql`${table.item_count} between 0 and 5000`
    ),
    warningsArrayCheck: check(
      'document_processing_evidence_warnings_array',
      sql`jsonb_typeof(${table.warnings}) = 'array'
        and jsonb_array_length(${table.warnings}) <= 100`
    ),
    payloadObjectCheck: check(
      'document_processing_evidence_payload_object',
      sql`jsonb_typeof(${table.payload}) = 'object'
        and ${table.payload}->>'job_id' = ${table.job_id}::text
        and ${table.payload}->>'attempt' = ${table.attempt}::text
        and ${table.payload}->>'source_sha256' = ${table.source_sha256}`
    ),
  })
)

export type DocumentProcessingEvidence =
  typeof documentProcessingEvidence.$inferSelect
export type DocumentProcessingEvidenceInsert =
  typeof documentProcessingEvidence.$inferInsert
