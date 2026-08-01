import { sql } from 'drizzle-orm'
import {
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
  boolean,
} from 'drizzle-orm/pg-core'
import {
  documentProcessingModeEnum,
  documentProcessingRequestedFormatEnum,
  documentProcessingStatusEnum,
} from './enums'
import { boms } from './boms'
import { documents } from './documents'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const documentProcessingJobs = pgTable(
  'document_processing_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    document_id: uuid('document_id').notNull(),
    project_id: uuid('project_id').notNull(),
    created_by: uuid('created_by').notNull(),
    mode: documentProcessingModeEnum('mode').notNull().default('cad'),
    requested_format: documentProcessingRequestedFormatEnum(
      'requested_format'
    )
      .notNull()
      .default('auto'),
    create_draft_bom: boolean('create_draft_bom').notNull().default(true),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: varchar('request_hash', { length: 64 }).notNull(),
    status: documentProcessingStatusEnum('status')
      .notNull()
      .default('queued'),
    attempt_count: integer('attempt_count').notNull().default(0),
    scope_item_count: integer('scope_item_count'),
    draft_bom_id: uuid('draft_bom_id'),
    warnings: jsonb('warnings').notNull().default([]),
    failure_code: varchar('failure_code', { length: 100 }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_document_processing_jobs_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantIdempotencyUniqueIdx: uniqueIndex(
      'ux_document_processing_jobs_tenant_idempotency'
    ).on(table.tenant_id, table.idempotency_key),
    tenantStatusIdx: index('idx_document_processing_jobs_tenant_status').on(
      table.tenant_id,
      table.status,
      table.updated_at
    ),
    documentIdx: index('idx_document_processing_jobs_tenant_document').on(
      table.tenant_id,
      table.document_id,
      table.created_at
    ),
    documentTenantFk: foreignKey({
      name: 'document_processing_jobs_document_tenant_fk',
      columns: [table.tenant_id, table.document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'document_processing_jobs_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'document_processing_jobs_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    draftBomTenantFk: foreignKey({
      name: 'document_processing_jobs_draft_bom_tenant_fk',
      columns: [table.tenant_id, table.draft_bom_id],
      foreignColumns: [boms.tenant_id, boms.id],
    }).onDelete('restrict'),
    idempotencyKeyCheck: check(
      'document_processing_jobs_idempotency_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    requestHashCheck: check(
      'document_processing_jobs_request_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    attemptCountCheck: check(
      'document_processing_jobs_attempt_count_nonnegative',
      sql`${table.attempt_count} >= 0`
    ),
    scopeItemCountCheck: check(
      'document_processing_jobs_scope_item_count_range',
      sql`${table.scope_item_count} is null or ${table.scope_item_count}
        between 0 and 5000`
    ),
    warningsArrayCheck: check(
      'document_processing_jobs_warnings_array',
      sql`jsonb_typeof(${table.warnings}) = 'array'
        and jsonb_array_length(${table.warnings}) <= 100`
    ),
    failureCodeCheck: check(
      'document_processing_jobs_failure_code_bounded',
      sql`${table.failure_code} is null or length(btrim(${table.failure_code}))
        between 1 and 100`
    ),
    stateTimestampsCheck: check(
      'document_processing_jobs_state_timestamps',
      sql`(
        (${table.status} in ('queued', 'processing')
          and ${table.completed_at} is null)
        or
        (${table.status} in ('succeeded', 'failed')
          and ${table.completed_at} is not null)
      )`
    ),
    completedAfterCreatedCheck: check(
      'document_processing_jobs_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type DocumentProcessingJob = typeof documentProcessingJobs.$inferSelect
export type DocumentProcessingJobInsert =
  typeof documentProcessingJobs.$inferInsert
