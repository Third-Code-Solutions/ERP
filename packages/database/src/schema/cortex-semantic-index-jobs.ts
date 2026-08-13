import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants'
import { users } from './users'

export const cortexSemanticIndexJobs = pgTable(
  'cortex_semantic_index_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    requested_by: uuid('requested_by').notNull(),
    idempotency_key: varchar('idempotency_key', { length: 256 }).notNull(),
    request_hash: varchar('request_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('queued'),
    max_nodes: integer('max_nodes').notNull().default(64),
    backlog_at_request: integer('backlog_at_request').notNull(),
    processed_nodes: integer('processed_nodes').notNull().default(0),
    attempt_count: integer('attempt_count').notNull().default(0),
    provider_call_count: integer('provider_call_count').notNull().default(0),
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
      'ux_cortex_semantic_index_jobs_tenant_id_id'
    ).on(table.tenant_id, table.id),
    tenantIdempotencyUniqueIdx: uniqueIndex(
      'ux_cortex_semantic_index_jobs_tenant_idempotency'
    ).on(table.tenant_id, table.idempotency_key),
    oneActivePerTenantIdx: uniqueIndex(
      'ux_cortex_semantic_index_jobs_one_active_tenant'
    )
      .on(table.tenant_id)
      .where(sql`${table.status} in ('queued', 'processing')`),
    tenantStatusIdx: index('idx_cortex_semantic_index_jobs_tenant_status').on(
      table.tenant_id,
      table.status,
      table.updated_at
    ),
    requestedByTenantFk: foreignKey({
      name: 'cortex_semantic_index_jobs_requested_by_tenant_fk',
      columns: [table.tenant_id, table.requested_by],
      foreignColumns: [users.tenant_id, users.id],
    }).onDelete('restrict'),
    idempotencyKeyCheck: check(
      'cortex_semantic_index_jobs_idempotency_key_nonempty',
      sql`${table.idempotency_key} = btrim(${table.idempotency_key})
        and length(${table.idempotency_key}) between 1 and 256`
    ),
    requestHashCheck: check(
      'cortex_semantic_index_jobs_request_hash_hex',
      sql`${table.request_hash} ~ '^[0-9a-f]{64}$'`
    ),
    statusCheck: check(
      'cortex_semantic_index_jobs_status_allowed',
      sql`${table.status} in ('queued', 'processing', 'succeeded', 'failed')`
    ),
    boundsCheck: check(
      'cortex_semantic_index_jobs_bounds',
      sql`${table.max_nodes} = 64
        and ${table.backlog_at_request} >= 0
        and ${table.processed_nodes} between 0 and ${table.max_nodes}
        and ${table.attempt_count} between 0 and 3
        and ${table.provider_call_count} between 0 and 1`
    ),
    failureCodeCheck: check(
      'cortex_semantic_index_jobs_failure_code_bounded',
      sql`${table.failure_code} is null or length(btrim(${table.failure_code}))
        between 1 and 100`
    ),
    stateTimestampsCheck: check(
      'cortex_semantic_index_jobs_state_timestamps',
      sql`(
        (${table.status} in ('queued', 'processing') and ${table.completed_at} is null)
        or
        (${table.status} in ('succeeded', 'failed') and ${table.completed_at} is not null)
      )`
    ),
    terminalStateCheck: check(
      'cortex_semantic_index_jobs_terminal_state',
      sql`${table.status} <> 'succeeded' or (
        ${table.failure_code} is null
        and ${table.processed_nodes} <= ${table.backlog_at_request}
      )`
    ),
    completedAfterCreatedCheck: check(
      'cortex_semantic_index_jobs_completed_after_created',
      sql`${table.completed_at} is null or ${table.completed_at} >= ${table.created_at}`
    ),
  })
)

export type CortexSemanticIndexJob =
  typeof cortexSemanticIndexJobs.$inferSelect
export type CortexSemanticIndexJobInsert =
  typeof cortexSemanticIndexJobs.$inferInsert
