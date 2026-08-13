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
import { cadEvidenceCommitRequestStateEnum } from './enums'
import { documents } from './documents'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const cadEvidenceCommitRequests = pgTable(
  'cad_evidence_commit_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    document_id: uuid('document_id').notNull(),
    project_id: uuid('project_id').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: char('request_hash', { length: 64 }).notNull(),
    state: cadEvidenceCommitRequestStateEnum('state')
      .notNull()
      .default('processing'),
    scope_item_count: integer('scope_item_count'),
    result: jsonb('result'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantIdUniqueIdx: uniqueIndex(
      'ux_cad_evidence_commit_requests_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantKeyUniqueIdx: uniqueIndex(
      'ux_cad_evidence_commit_requests_tenant_key'
    ).on(table.tenant_id, table.idempotency_key),
    tenantStateIdx: index(
      'idx_cad_evidence_commit_requests_tenant_state'
    ).on(table.tenant_id, table.state, table.created_at),
    documentTenantFk: foreignKey({
      name: 'cad_evidence_commit_requests_document_tenant_fk',
      columns: [table.tenant_id, table.document_id],
      foreignColumns: [documents.tenant_id, documents.id],
    }).onDelete('restrict'),
    projectTenantFk: foreignKey({
      name: 'cad_evidence_commit_requests_project_tenant_fk',
      columns: [table.tenant_id, table.project_id],
      foreignColumns: [projects.tenant_id, projects.id],
    }).onDelete('restrict'),
    createdByTenantFk: foreignKey({
      name: 'cad_evidence_commit_requests_created_by_tenant_fk',
      columns: [table.tenant_id, table.created_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    keyCheck: check(
      'cad_evidence_commit_requests_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    hashCheck: check(
      'cad_evidence_commit_requests_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    countCheck: check(
      'cad_evidence_commit_requests_count_range',
      sql`${table.scope_item_count} is null or ${table.scope_item_count}
        between 0 and 5000`
    ),
    resultObjectCheck: check(
      'cad_evidence_commit_requests_result_object',
      sql`${table.result} is null or jsonb_typeof(${table.result}) = 'object'`
    ),
    statePayloadCheck: check(
      'cad_evidence_commit_requests_state_payload',
      sql`(
        (${table.state} = 'processing'
          and ${table.scope_item_count} is null
          and ${table.result} is null
          and ${table.completed_at} is null)
        or
        (${table.state} = 'succeeded'
          and ${table.scope_item_count} is not null
          and ${table.result} is not null
          and ${table.completed_at} is not null)
      )`
    ),
    completedAfterCreatedCheck: check(
      'cad_evidence_commit_requests_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type CadEvidenceCommitRequest =
  typeof cadEvidenceCommitRequests.$inferSelect
export type CadEvidenceCommitRequestInsert =
  typeof cadEvidenceCommitRequests.$inferInsert
